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
    if (s.get("processAlive") is not True or
        s.get("reportedConnected") is not True or
        s.get("sessionEstablished") is not True or
        s.get("statusSource") != "current_process" or
        s.get("serverPort") not in (None, 17879) or
        s.get("world") not in (None, "Bedrock level")):
        raise ValueError("not_current_17879_session")
    d = private_read(ROOT / "status.json", 8192)
    if (d.get("producerPid") != s.get("pid") or
        d.get("world") != "Bedrock level" or d.get("serverPort") != 17879 or
        not isinstance(d.get("producerStartToken"), str)):
        raise ValueError("wrong_owner")
    return s, d

def demand_now(d):
    e = d.get("movementEvidence") or {}
    settings = d.get("settings") or {}
    return bool(
        d.get("state") == "IDLE" and
        d.get("connected") is True and d.get("sessionEstablished") is True and
        d.get("health", 0) >= 16 and
        settings.get("autonomyEnabled") is True and
        settings.get("agentMode") == "autonomous" and
        # The 5s idle controller may have cleared navigationHold during
        # a brief proof window, leaving "eligible_for_work" while the BDS
        # pair has expired. That is still a real pending autonomy need,
        # whereas STOP, threats, FOLLOW, cooldowns and jobs are excluded.
        (d.get("worldRoutine") or {}).get("idleGate") in
            ("position_witness_unverified", "eligible_for_work") and
        isinstance(e.get("witnessDemand"), dict) and
        e["witnessDemand"].get("state") in ("needs_two_fresh_samples", "needs_second_fresh_sample") and
        e["witnessDemand"].get("positionGateSatisfied") is False and
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
    if not isinstance(obj,dict) or obj.get("hour") != hour:
        return {"version":1,"hour":hour,"used":0,"lastBatch":0}
    if (obj.get("version")!=1 or type(obj.get("used")) is not int or
        not 0<=obj["used"]<=MAX_HOURLY or
        type(obj.get("lastBatch")) not in (int,float)):
        raise ValueError("invalid_budget")
    return obj

def consume_budget(now, budget):
    if budget["used"] >= MAX_HOURLY:
        return False
    budget["used"] += 1
    private_write(BUDGET, budget)
    return True

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
        if now-b["lastBatch"] < MIN_BATCH_SECONDS or b["used"]+2 > MAX_HOURLY:
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
            if seen["positionGateSatisfied"]:return "position_pair_verified"
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
    assert MAX_HOURLY==40 and MIN_BATCH_SECONDS>=55
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
