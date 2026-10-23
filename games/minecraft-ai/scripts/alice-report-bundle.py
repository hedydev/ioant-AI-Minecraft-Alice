#!/usr/bin/env python3
"""Add privacy-allowlisted read-only Mint status/diagnose to a Desktop acceptance ZIP."""
import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
import sys
import zipfile

MAX_INPUT = 64 * 1024
MAX_ARCHIVE = 8 * 1024 * 1024
STATUS_ENUMS = {
    "statusSource": {"current_process", "no_running_process", "awaiting_current_process_heartbeat"},
}
BOOL_STATUS = ("processAlive", "heartbeatFresh", "reportedConnected", "sessionEstablished")
INT_STATUS = ("pid", "statusFilePid", "bdsSamples")
NUM_STATUS = ("heartbeatAgeSeconds", "health", "serverTravelBlocks")
PHASES = {"alive", "dead", "respawn_stalled", "respawning", "server_ready", "respawn_verified",
          "dead_waiting_ready", "dead_waiting_spawn", "not_dead", "unavailable"}
LIFECYCLE = {"session_lifecycle", "server_disconnect", "session_closed", "connection_ended",
             "server_kicked", "respawn_recovery", "death_observed", "spawn_confirmed",
             "shutdown_requested", "uncaught_runtime_error"}
SOURCE_STATUS = {"unavailable", "available"}
LOG_NAME = re.compile(r"^operator-alice-[A-Za-z0-9_.-]{1,100}\.log$")
STATE_NAME = re.compile(r"^[A-Za-z_]{1,48}$")
REASON_NAME = re.compile(r"^[a-z_]{1,100}$")
TIME_NAME = re.compile(r"^[0-9T:+.Z-]{10,48}$")


def finite(v, low=-1e9, high=1e9):
    return type(v) in (int, float) and math.isfinite(v) and low <= v <= high


def integer(v):
    return type(v) is int and 0 <= v <= 2_147_483_647


def point(v):
    if not isinstance(v, dict):
        return None
    if all(finite(v.get(key), -30_000_000, 30_000_000) for key in ("x", "y", "z")):
        return {key: v[key] for key in ("x", "y", "z")}
    return None


def read_json(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_INPUT:
        raise ValueError("Unsafe or oversized Mint diagnostic capture")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Malformed Mint diagnostic capture") from exc
    if not isinstance(value, dict):
        raise ValueError("Mint diagnostic capture is not an object")
    return value


def sanitize_status(raw):
    if raw.get("_capture") == "unavailable":
        return {"capture": "unavailable"}
    result = {"capture": "available"}
    for key, allowed in STATUS_ENUMS.items():
        if isinstance(raw.get(key), str) and raw[key] in allowed:
            result[key] = raw[key]
    for key in BOOL_STATUS:
        if type(raw.get(key)) is bool:
            result[key] = raw[key]
    for key in INT_STATUS:
        if integer(raw.get(key)):
            result[key] = raw[key]
    for key in NUM_STATUS:
        if finite(raw.get(key)):
            result[key] = raw[key]
    if isinstance(raw.get("state"), str) and STATE_NAME.fullmatch(raw["state"]):
        result["state"] = raw["state"]
    for key in ("clientFeet", "serverFeet"):
        xyz = point(raw.get(key))
        if xyz is not None:
            result[key] = xyz
    recovery = raw.get("deathRecovery")
    if isinstance(recovery, dict):
        clean = {}
        if isinstance(recovery.get("phase"), str) and recovery["phase"] in PHASES:
            clean["phase"] = recovery["phase"]
        for key in ("retrySent", "readyRetrySent", "serverReadyObserved"):
            if type(recovery.get(key)) is bool:
                clean[key] = recovery[key]
        if finite(recovery.get("deadSeconds"), 0, 86400):
            clean["deadSeconds"] = recovery["deadSeconds"]
        if clean:
            result["deathRecovery"] = clean
    hold = raw.get("idleHold")
    if isinstance(hold, dict):
        reason = hold.get("reason")
        if isinstance(reason, str) and REASON_NAME.fullmatch(reason):
            result["idleHold"] = {"reason": reason}
    return result


def _log_basename(raw):
    if not isinstance(raw, str):
        return None
    name = Path(raw).name
    return name if LOG_NAME.fullmatch(name) else None


def sanitize_diagnose(raw):
    if raw.get("_capture") == "unavailable":
        return {"capture": "unavailable"}
    result = {"capture": "available"}
    for key in ("lockedPid", "candidateCount"):
        if integer(raw.get(key)):
            result[key] = raw[key]
    for key in ("possibleDuplicate", "ownerMatchesCandidate"):
        if type(raw.get(key)) is bool:
            result[key] = raw[key]
    candidates = raw.get("aliceProcessCandidates")
    if isinstance(candidates, list):
        result["aliceProcessCandidates"] = [
            {"pid": c["pid"], "cwd": c["cwd"]}
            for c in candidates[:20] if isinstance(c, dict)
            and integer(c.get("pid")) and c.get("cwd") in ("project", "runtime_state")
        ]
    current = _log_basename(raw.get("currentOperatorLog"))
    if current:
        result["currentOperatorLogBasename"] = current
    logs = raw.get("recentOperatorLogs")
    if isinstance(logs, list):
        filtered = []
        for item in logs[:8]:
            if not isinstance(item, dict):
                continue
            name = _log_basename(item.get("path"))
            if name:
                filtered.append({"basename": name})
        result["recentOperatorLogBasenames"] = filtered
    lifecycle = raw.get("recentLifecycle")
    if isinstance(lifecycle, list):
        filtered = []
        for row in lifecycle[:18]:
            if (not isinstance(row, dict) or not isinstance(row.get("event"), str)
                    or row["event"] not in LIFECYCLE):
                continue
            event = {"event": row["event"]}
            if integer(row.get("pid")):
                event["pid"] = row["pid"]
            if isinstance(row.get("time"), str) and TIME_NAME.fullmatch(row["time"]):
                event["time"] = row["time"]
            name = _log_basename(row.get("file"))
            if name:
                event["file"] = name
            if isinstance(row.get("kind"), str) and row["kind"] in {
                    "none", "server_disconnect", "server_kicked",
                    "transport_closed", "transport_ended", "operator_shutdown"}:
                event["kind"] = row["kind"]
            filtered.append(event)
        result["recentLifecycle"] = filtered
    return result


def _value(obj, key):
    value = obj.get(key)
    if value is None:
        return "unknown"
    if type(value) is bool:
        return "true" if value else "false"
    return str(value)


def add_report(archive_path, status, diagnose, *, now=None):
    archive_path = Path(archive_path)
    if (archive_path.is_symlink() or not archive_path.is_file()
            or archive_path.stat().st_size > MAX_ARCHIVE):
        raise ValueError("Unsafe or oversized acceptance ZIP")
    status = sanitize_status(status)
    diagnose = sanitize_diagnose(diagnose)
    moment = now or datetime.now(timezone.utc)
    with zipfile.ZipFile(archive_path, "a", compression=zipfile.ZIP_DEFLATED) as z:
        if z.testzip() is not None:
            raise ValueError("Corrupt acceptance ZIP")
        names = set(z.namelist())
        if not {"manifest.json", "events.jsonl", "deployment.json"}.issubset(names):
            raise ValueError("Acceptance ZIP missing required data")
        if {"REPORT.md", "operator-status.json", "operator-diagnose.json"} & names:
            raise ValueError("Diagnostic ZIP cannot be appended twice")
        manifest = json.loads(z.read("manifest.json"))
        if not isinstance(manifest, dict):
            raise ValueError("Malformed acceptance manifest")
        summary = [
            "# AliceAI 只读运行验收报告",
            "",
            f"- 生成时间 UTC: {moment.isoformat()}",
            f"- 验收窗口: {manifest.get('requestedHours', 'unknown')} 小时",
            f"- 结构化记录: {manifest.get('records', 'unknown')}",
            f"- 状态采样: {manifest.get('samples', 'unknown')}",
            f"- 行为事件: {manifest.get('events', 'unknown')}",
            "",
            "## Mint 当前运行状态（独立只读采集）",
            f"- 采集: {_value(status, 'capture')}",
            f"- 当前实例 PID: {_value(status, 'pid')}",
            f"- 进程存活: {_value(status, 'processAlive')}",
            f"- 心跳新鲜: {_value(status, 'heartbeatFresh')}",
            f"- 状态来源: {_value(status, 'statusSource')}",
            f"- 网络会话建立: {_value(status, 'sessionEstablished')}",
            f"- 角色生成状态: {_value(status, 'reportedConnected')}",
            f"- Alice 核心状态: {_value(status, 'state')}",
            f"- 血量: {_value(status, 'health')}",
            f"- 独立 BDS 样本数: {_value(status, 'bdsSamples')}",
            f"- IDLE 安全原因: {_value(status.get('idleHold') or {}, 'reason')}",
            f"- 死亡复活阶段: {_value(status.get('deathRecovery') or {}, 'phase')}",
            "",
            "## 单实例和部署信息",
            f"- 运维扫描可疑实例: {_value(diagnose, 'candidateCount')}",
            f"- 潜在重复进程: {_value(diagnose, 'possibleDuplicate')}",
            f"- 锁匹配: {_value(diagnose, 'ownerMatchesCandidate')}",
            "- deployment.json 仅验证 Mac/Mint 磁盘哈希与源码修改时间，不能单独证明 Node 已重载。",
            "- 本报告不执行部署、重启、世界修改、查询 BDS 控制台或创建新 Xbox 登录。",
            "- 客户端本地预测坐标与发送的数据包，不等于 BDS 服务器证实移动。",
            "",
            "## ZIP 文件说明",
            "- events.jsonl: 匿名行为时间线和按时采集的状态",
            "- manifest.json: 时间窗口及事件总数",
            "- deployment.json: 源码一致性与最近生成时间启发式",
            "- operator-status.json: Mint CLI 白名单状态快照",
            "- operator-diagnose.json: Mint CLI 白名单进程及生命周期快照",
            "- REPORT.md: 本摘要，可直接在文本编辑器查看",
            "",
            "可直接将整个 ZIP 上传到 ChatGPT，无需复制终端输出。",
        ]
        z.writestr("operator-status.json", json.dumps(status, ensure_ascii=False, indent=2))
        z.writestr("operator-diagnose.json", json.dumps(diagnose, ensure_ascii=False, indent=2))
        z.writestr("REPORT.md", "\n".join(summary) + "\n")
    return status, diagnose


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive")
    parser.add_argument("status")
    parser.add_argument("diagnose")
    args = parser.parse_args()
    add_report(args.archive, read_json(args.status), read_json(args.diagnose))
    print("[Alice report] Added read-only sanitized Mint status, diagnose and REPORT.md")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as exc:
        print("[Alice report] Cannot safely prepare diagnostic ZIP: " + type(exc).__name__,
              file=sys.stderr)
        sys.exit(2)
