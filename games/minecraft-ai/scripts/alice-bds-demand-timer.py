#!/usr/bin/env python3
"""User-scoped MCSManager witness *on-demand* timer; never an infinite query loop.
Only original 17879, max 2 commands per triggered burst and max 40/hour.
Only if the owner-verified live autonomous Alice is IDLE solely because
independent BDS position has expired. The existing 250ms ACK coordinates the pair.
Nothing ever changes BDS configuration, world data, client physics or safety gates.
"""
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import time

HOME = Path.home()
ROOT = HOME / ".alice-bedrock-control"
SCRIPTS = HOME / "minecraft-ai" / "scripts"
BUDGET = ROOT / "bds-demand-budget.json"
OPTIN = ROOT / "bds-demand-optin.json"
LOCK = ROOT / "bds-demand-single-flight.lock"
SERVICE = "alice-bds-demand.service"
TIMER = "alice-bds-demand.timer"
MAX_HOURLY = 40
MIN_BATCH_SECONDS = 55
# Two authorized commands per admitted pair. Spread the existing 40/hour
# cap across one hour; otherwise the old 60s timer exhausted it in ~20m
# and left Alice without independent position proof for ~40m.
SUSTAINED_BATCH_SECONDS = 180

def private_root():
    st = ROOT.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid() or st.st_mode & 0o077:
        raise ValueError("unsafe_root")

def private_read(path, limit):
    if path.is_symlink() or not path.is_file():
        raise ValueError("unsafe_file")
    st = path.stat()
    if st.st_uid != os.getuid() or st.st_mode & 0o077 or not 0 < st.st_size <= limit:
        raise ValueError("unsafe_permissions")
    return json.loads(path.read_text(encoding="utf-8"))

def private_write(path, obj):
    private_root()
    if path.is_symlink():
        raise ValueError("unsafe_destination")
    raw = json.dumps(obj, separators=(",", ":")).encode("ascii")
    if len(raw) > 512:
        raise ValueError("oversized_private_record")
    fd, tmp = tempfile.mkstemp(prefix=".bds-demand-", dir=ROOT)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.lexists(tmp):
            os.unlink(tmp)

def process_json(name, timeout=15):
    p = subprocess.run(["/usr/bin/python3", str(SCRIPTS / "alice-mint.py"), name],
            capture_output=True, text=True, timeout=timeout, check=False)
    if p.returncode or len(p.stdout) > 23000:
        raise ValueError("operator_unavailable")
    return json.loads(p.stdout)

def active_owner():
    s = process_json("status")
    # A live PID with a 15-minute-old status.json is NOT a live BDS
    # navigation demand. Fail closed even when its last values say connected.
    heartbeat = s.get("heartbeatAgeSeconds")
    if (s.get("heartbeatFresh") is not True or
        type(heartbeat) not in (int,float) or not 0<=heartbeat<=10 or
        s.get("processAlive") is not True or
        s.get("reportedConnected") is not True or
        s.get("sessionEstablished") is not True or
        s.get("statusSource") != "current_process" or
        s.get("serverPort") not in (None, 17879) or
        s.get("world") not in (None, "Bedrock level")):
        raise ValueError("not_current_17879_session")
    status_file=ROOT / "status.json"
    mtime=status_file.stat().st_mtime
    d = private_read(status_file, 8192)
    updated=d.get("updatedAt")
    nowms=int(time.time()*1000)
    if (not isinstance(updated,int) or updated<=0 or updated>nowms+1000 or
        nowms-updated>10000 or time.time()-mtime>10 or
        d.get("producerPid") != s.get("pid") or
        d.get("world") != "Bedrock level" or d.get("serverPort") != 17879 or
        not isinstance(d.get("producerStartToken"), str)):
        raise ValueError("wrong_owner")
    return s, d

def safe_night_witness_need(d):
    # Night survival can be waiting for a fresh server position while the
    # regular raw-materials job is in work_cooldown. That cooldown must not
    # suppress the independent evidence needed for NON-DESTRUCTIVE survival.
    # Never convert a generic work cooldown or historical night status into
    # permission. Human STOP/FOLLOW, current jobs and paused goals fail closed.
    wr = d.get("worldRoutine") or {}
    night = wr.get("nightSurvival") or {}
    goal = d.get("longTermGoal") or {}
    return bool(
        wr.get("phase") in ("night", "dusk") and
        wr.get("idleGate") == "work_cooldown" and
        isinstance(night, dict) and
        night.get("reason") == "scout_bds_position_unavailable" and
        d.get("job") is None and
        d.get("followTarget") is None and
        isinstance(goal, dict) and
        goal.get("phase") not in ("PAUSED", "ACTING") and
        goal.get("reason") not in ("user_stop", "player_override")
    )


def demand_now(d):
    e = d.get("movementEvidence") or {}
    settings = d.get("settings") or {}
    wr = d.get("worldRoutine") or {}
    need = e.get("witnessDemand") or {}
    return bool(
        d.get("state") == "IDLE" and
        d.get("connected") is True and d.get("sessionEstablished") is True and
        d.get("health", 0) >= 16 and
        settings.get("autonomyEnabled") is True and
        settings.get("agentMode") == "autonomous" and
        # Regular autonomy is admitted only on its original idle gates.
        # A separate narrowly proven night-survival demand is allowed while
        # raw-material work cools down; NEVER admit arbitrary cooldowns.
        (wr.get("idleGate") in
            ("position_witness_unverified", "eligible_for_work") or
         safe_night_witness_need(d)) and
        isinstance(need, dict) and
        need.get("state") in
            ("needs_two_fresh_samples", "needs_second_fresh_sample") and
        need.get("positionGateSatisfied") is False and
        e.get("awaitingVerifiedRespawn") is not True and
        isinstance(e.get("loginAt"), int)
    )

def binding_ok():
    sys.path.insert(0, str(SCRIPTS))
    import bds_position_witness as w
    cfg, _ = w.validated_config()
    path = Path("/opt/mcsmanager/daemon/data/InstanceConfig") / (cfg["instanceId"] + ".json")
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 65536:
        raise ValueError("instance_unverified")
    obj = json.loads(path.read_text(encoding="utf-8"))
    def cwd(v):
        if not isinstance(v, dict): return None
        for k in ("cwd", "workingDirectory", "workingDir"):
            if isinstance(v.get(k), str): return v[k]
        return cwd(v.get("config"))
    directory = cwd(obj)
    if not directory or Path(directory).resolve(strict=True) != HOME / "minecraft-bedrock":
        raise ValueError("not_original_bds")
    props = HOME / "minecraft-bedrock/server.properties"
    if props.is_symlink() or not props.is_file() or props.stat().st_size > 10000 or (
        "server-port=17879" not in props.read_text(encoding="utf-8").splitlines()
    ):
        raise ValueError("wrong_bds_properties")
    legacy = subprocess.run(["/usr/bin/systemctl","--user","is-active",
        "alice-bds-position-witness.service"],capture_output=True,text=True,timeout=6)
    if legacy.returncode == 0 and legacy.stdout.strip() == "active":
        raise ValueError("legacy_loop_active")

def ack(s, d):
    try:
        a = private_read(ROOT / "bds-witness-ack.json", 420)
        now = int(time.time()*1000)
        if (a.get("version") != 1 or a.get("writerPid") != s.get("pid") or
            a.get("producerStartToken") != d.get("producerStartToken") or
            a.get("loginAt") != (d.get("movementEvidence") or {}).get("loginAt") or
            type(a.get("independentSamples")) is not int or
            type(a.get("independentAt")) is not int or
            not 0 <= now-a["independentAt"] <= 4000 or
            type(a.get("positionGateSatisfied")) is not bool):
            return None
        return a
    except (OSError,ValueError,TypeError,KeyError, json.JSONDecodeError):
        return None

def budget_value(now, obj=None):
    hour = int(now//3600)
    if not isinstance(obj,dict):
        return {"version":1,"hour":hour,"used":0,"lastBatch":0}
    if (obj.get("version")!=1 or type(obj.get("used")) is not int or
        not 0<=obj["used"]<=MAX_HOURLY or
        type(obj.get("lastBatch")) not in (int,float) or
        not 0<=obj["lastBatch"]<=now):
        raise ValueError("invalid_budget")
    if obj.get("hour")==hour:
        return obj
    # Crossing an hourly budget boundary resets only the query count.
    # Preserve the last-batch pacing and same-life 10-minute stall cooldown;
    # resetting either here could flood queries at midnight/hour rollover.
    fresh={"version":1,"hour":hour,"used":0,"lastBatch":obj["lastBatch"]}
    if (type(obj.get("trackedLoginAt")) is int and obj["trackedLoginAt"]>0
        and type(obj.get("trackedTravel")) in (int,float)
        and 0<=obj["trackedTravel"]<30000000
        and type(obj.get("stalledPairs")) is int and 0<=obj["stalledPairs"]<=3
        and type(obj.get("pauseUntil")) in (int,float)
        and obj["pauseUntil"]>=0):
        fresh.update(trackedLoginAt=obj["trackedLoginAt"],
                     trackedTravel=obj["trackedTravel"],
                     stalledPairs=obj["stalledPairs"],
                     pauseUntil=obj["pauseUntil"])
    return fresh

def budget_allows_batch(now, budget):
    # Verify the *next complete two-sample proof* fits both the independent
    # hourly command cap and the sustainable pacing window. No partial pair.
    return (type(now) in (int,float) and
            type(budget.get("lastBatch")) in (int,float) and
            type(budget.get("used")) is int and
            now-budget["lastBatch"]>=max(MIN_BATCH_SECONDS,SUSTAINED_BATCH_SECONDS) and
            0<=budget["used"]<=MAX_HOURLY-2)

def consume_budget(now, budget):
    if budget["used"] >= MAX_HOURLY:
        return False
    budget["used"] += 1
    private_write(BUDGET, budget)
    return True

# Three independently verified stationary pairs without any corroborated BDS
# travel are a diagnostic stalemate, not permission to flood querytarget every
# minute. The existing 40/hour cap remains, and an observed >=0.25-block BDS
# change immediately clears the cooldown. This ledger is local-only, not proof
# of physical navigation or a reason to grant a safety bypass.
STALLED_PAIRS_LIMIT = 3
STALLED_COOLDOWN_SECONDS = 600

def server_travel(d):
    e = d.get("movementEvidence") or {}
    v = e.get("independentTravelBlocks")
    if type(v) in (int, float) and 0 <= v < 30000000:
        return round(v, 4)
    return None

def refresh_stall_state(budget, d, now):
    login = (d.get("movementEvidence") or {}).get("loginAt")
    travel = server_travel(d)
    if type(login) is not int or travel is None:
        return False
    # A respawn or new session never inherits an older session's cooldown.
    if budget.get("trackedLoginAt") != login:
        budget.update(trackedLoginAt=login, trackedTravel=travel,
                      stalledPairs=0, pauseUntil=0)
    else:
        prev = budget.get("trackedTravel")
        if type(prev) not in (int, float) or abs(travel - prev) >= .25:
            budget.update(trackedTravel=travel, stalledPairs=0, pauseUntil=0)
    return (budget.get("stalledPairs", 0) >= STALLED_PAIRS_LIMIT
            and now < budget.get("pauseUntil", 0))

def record_verified_stationary_pair(budget, d, now):
    # Only the actually accepted 250ms Alice ACK may reach this function;
    # never record a successful pair from a query-dispatched HTTP ack.
    login = (d.get("movementEvidence") or {}).get("loginAt")
    travel = server_travel(d)
    if type(login) is not int or travel is None:
        return
    if budget.get("trackedLoginAt") != login:
        budget.update(trackedLoginAt=login, trackedTravel=travel,
                      stalledPairs=0, pauseUntil=0)
    baseline = budget.get("trackedTravel")
    if type(baseline) not in (int, float) or abs(travel - baseline) >= .25:
        budget.update(trackedTravel=travel, stalledPairs=0, pauseUntil=0)
    else:
        budget["stalledPairs"] = min(
            STALLED_PAIRS_LIMIT, budget.get("stalledPairs", 0) + 1)
        if budget["stalledPairs"] >= STALLED_PAIRS_LIMIT:
            budget["pauseUntil"] = now + STALLED_COOLDOWN_SECONDS
    private_write(BUDGET, budget)

def run():
    private_root()
    cfg = private_read(OPTIN, 128)
    if cfg != {"version":1,"enabled":True,"maxHourly":MAX_HOURLY,
               "minBatchSeconds":MIN_BATCH_SECONDS}:
        return "not_opted_in"
    # One running systemd job at a time, plus a second local flock guard.
    flags = os.O_CREAT | os.O_RDWR | getattr(os,"O_NOFOLLOW",0)
    fd = os.open(LOCK, flags, 0o600)
    try:
        st=os.fstat(fd)
        if st.st_uid!=os.getuid() or st.st_mode&0o077:
            return "unsafe_lock"
        try: fcntl.flock(fd, fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: return "already_running"
        s,d = active_owner()
        if not demand_now(d): return "no_navigation_demand"
        binding_ok()
        now = time.time()
        # First activation has no budget file yet. Missing is valid; a
        # symlink or unreadable existing ledger must still fail closed.
        b=budget_value(now,private_read(BUDGET,256)) if (
            BUDGET.exists() or BUDGET.is_symlink()) else budget_value(now)
        stalled = refresh_stall_state(b, d, now)
        if stalled:
            private_write(BUDGET, b)
            return "stalled_navigation_cooldown"
        if not budget_allows_batch(now,b):
            return "cooldown_or_budget"
        b["lastBatch"]=now
        private_write(BUDGET,b)
        pid, token = s.get("pid"), d["producerStartToken"]
        first=ack(s,d)
        prev=first["independentSamples"] if first else (
            (d.get("movementEvidence") or {}).get("independentSamples"))
        if type(prev) is not int: return "sample_counter_missing"
        for _ in range(2):
            s,d=active_owner()
            if s.get("pid")!=pid or d.get("producerStartToken")!=token or not demand_now(d):
                return "navigation_context_changed"
            if not consume_budget(time.time(),b):return "budget_exhausted"
            issued=int(time.time()*1000)
            p=subprocess.run(["/usr/bin/python3",str(SCRIPTS/"bds_position_witness.py"),
              "--once"],capture_output=True,text=True,timeout=32,check=False)
            if p.returncode or p.stdout.strip() != "BDS querytarget witness: accepted new independent sample":
                return "command_unverified"
            seen=None;deadline=time.monotonic()+2
            while time.monotonic()<deadline:
                time.sleep(.1)
                s,d=active_owner()
                if s.get("pid")!=pid or d.get("producerStartToken")!=token:
                    return "session_changed"
                row=ack(s,d)
                if row and row["independentSamples"]>prev and row["independentAt"]>=issued-100:
                    seen=row;break
            if seen is None: return "ack_timeout"
            prev=seen["independentSamples"]
            if seen["positionGateSatisfied"]:
                record_verified_stationary_pair(b, d, time.time())
                return "position_pair_verified"
        return "pair_not_aligned"
    finally: os.close(fd)

def installer():
    private_root()
    # Reject an accidental install to any other host or missing operator config.
    binding_ok()
    unit_dir=HOME/".config/systemd/user"
    if unit_dir.is_symlink(): raise ValueError("unsafe_systemd_dir")
    unit_dir.mkdir(parents=True,exist_ok=True,mode=0o700)
    service = """[Unit]
Description=Bounded Alice BDS demand-only position witness (no loop)
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 %h/minecraft-ai/scripts/alice-bds-demand-timer.py --run
TimeoutStartSec=95
UMask=0077
"""
    timer = """[Unit]
Description=Run Alice BDS position witness only when autonomous navigation needs it

[Timer]
OnActiveSec=35s
OnUnitActiveSec=60s
AccuracySec=2s
Persistent=false
Unit=alice-bds-demand.service

[Install]
WantedBy=timers.target
"""
    for name, data in ((SERVICE,service),(TIMER,timer)):
        target=unit_dir/name
        if target.is_symlink() or (target.exists() and target.read_text()!=data):
            raise ValueError("systemd_unit_conflict")
    private_write(OPTIN,{"version":1,"enabled":True,
        "maxHourly":MAX_HOURLY,"minBatchSeconds":MIN_BATCH_SECONDS})
    for name,data in ((SERVICE,service),(TIMER,timer)):
        target=unit_dir/name
        if not target.exists():
            target.write_text(data,encoding="utf-8")
            target.chmod(0o600)
    subprocess.run(["/usr/bin/systemctl","--user","daemon-reload"],check=True,timeout=12)
    subprocess.run(["/usr/bin/systemctl","--user","enable","--now",TIMER],
                   check=True,timeout=20,capture_output=True)
    return "timer_enabled"

def selftest():
    assert budget_value(3601)["used"]==0
    one=budget_value(3601,{"version":1,"hour":1,"used":12,"lastBatch":3540})
    assert one["used"]==12
    assert budget_value(7201,one)["used"]==0
    assert demand_now({"state":"IDLE","connected":True,"sessionEstablished":True,
      "health":20,"settings":{"autonomyEnabled":True,"agentMode":"autonomous"},
      "worldRoutine":{"idleGate":"position_witness_unverified"},
      "movementEvidence":{"loginAt":1000,"awaitingVerifiedRespawn":False,
      "witnessDemand":{"state":"needs_two_fresh_samples","positionGateSatisfied":False}}})
    assert not demand_now({"state":"IDLE"})
    night={"state":"IDLE","connected":True,"sessionEstablished":True,
       "health":20,"job":None,"followTarget":None,
       "longTermGoal":{"phase":"WAITING","reason":"waiting_for_daylight"},
       "settings":{"autonomyEnabled":True,"agentMode":"autonomous"},
       "worldRoutine":{"phase":"night","idleGate":"work_cooldown",
          "nightSurvival":{"reason":"scout_bds_position_unavailable"}},
       "movementEvidence":{"loginAt":1000,"awaitingVerifiedRespawn":False,
          "witnessDemand":{"state":"needs_two_fresh_samples",
             "positionGateSatisfied":False}}}
    assert safe_night_witness_need(night) and demand_now(night)
    assert not demand_now({**night,"worldRoutine":{**night["worldRoutine"],"phase":"day"}})
    assert not demand_now({**night,"worldRoutine":{**night["worldRoutine"],
       "nightSurvival":{"reason":"no_safe_shelter"}}})
    assert not demand_now({**night,"longTermGoal":{"phase":"PAUSED","reason":"user_stop"}})
    assert not demand_now({**night,"followTarget":"Steve"})
    assert not demand_now({**night,"job":"EXPLORE"})
    assert not demand_now({**night,"movementEvidence":{**night["movementEvidence"],
       "witnessDemand":{"state":"fresh_pair_aligned","positionGateSatisfied":True}}})

    assert MAX_HOURLY==40 and MIN_BATCH_SECONDS>=55 and SUSTAINED_BATCH_SECONDS>=180
    print("ALICE_BDS_DEMAND_TIMER_SELFTEST_PASS")

if __name__=="__main__":
    if sys.argv[1:]==["--self-test"]:selftest()
    elif sys.argv[1:]==["--run"]:
        try:result=run()
        except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):
            result="safe_failure"
        print("ALICE_BDS_DEMAND_TIMER "+result)
    elif sys.argv[1:]==["--install"]:
        try:
            print("ALICE_BDS_DEMAND_TIMER "+installer())
        except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError):
            print("ALICE_BDS_DEMAND_TIMER install_blocked")
            raise SystemExit(1)
    else:raise SystemExit("usage: --self-test | --run | --install")
