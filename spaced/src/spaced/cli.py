from __future__ import annotations

import argparse
import importlib.util
import json
import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

JsonDict = Dict[str, Any]


def now_ms() -> int:
    return int(time.time() * 1000)


@dataclass
class Paths:
    workspace: Path

    @property
    def spaced_dir(self) -> Path:
        return self.workspace / ".intent-space" / "spaced"

    @property
    def state_file(self) -> Path:
        return self.spaced_dir / "state.json"

    @property
    def pid_file(self) -> Path:
        return self.spaced_dir / "daemon.pid"

    @property
    def log_file(self) -> Path:
        return self.spaced_dir / "daemon.log"


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def read_json(path: Path, default: JsonDict | List[Any]) -> JsonDict | List[Any]:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: JsonDict | List[Any]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def load_state(paths: Paths, sdk_dir: Optional[Path] = None, interval: float = 1.0) -> JsonDict:
    ensure_dir(paths.spaced_dir)
    state = read_json(
        paths.state_file,
        {
            "config": {
                "workspace": str(paths.workspace),
                "sdkDir": str(sdk_dir or paths.workspace),
                "intervalSeconds": interval,
            },
            "startedAt": None,
            "lastTickAt": None,
            "lastError": None,
            "targets": {},
            "queuedEvents": [],
        },
    )
    assert isinstance(state, dict)
    return state


def save_state(paths: Paths, state: JsonDict) -> None:
    ensure_dir(paths.spaced_dir)
    write_json(paths.state_file, state)


def load_sdk(sdk_dir: Path) -> Any:
    module_path = sdk_dir / "intent_space_sdk.py"
    if not module_path.exists():
        raise FileNotFoundError(f"intent_space_sdk.py not found in {sdk_dir}")
    spec = importlib.util.spec_from_file_location("intent_space_sdk", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load SDK from {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_transcript(transcript_path: Path) -> List[JsonDict]:
    if not transcript_path.exists():
        return []
    events: List[JsonDict] = []
    for line in transcript_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        entry = json.loads(line)
        if isinstance(entry, dict):
            events.append(entry)
    return events


def resolve_station_contexts(local_state: Any) -> List[JsonDict]:
    contexts: List[JsonDict] = []
    for entry in local_state.load_known_stations():
        if not isinstance(entry, dict):
            continue
        endpoint = entry.get("endpoint")
        audience = entry.get("audience")
        station_token = entry.get("stationToken")
        sender_id = entry.get("principalId") or entry.get("handle")
        if not all(isinstance(value, str) and value for value in [endpoint, audience, station_token, sender_id]):
            continue
        contexts.append(
            {
                "endpoint": endpoint,
                "audience": audience,
                "stationToken": station_token,
                "senderId": sender_id,
                "spaceId": entry.get("spaceId") if isinstance(entry.get("spaceId"), str) else None,
            }
        )
    return contexts


def base_target(target_id: str, kind: str, context: JsonDict, discovered_from: str) -> JsonDict:
    return {
        "id": target_id,
        "kind": kind,
        "endpoint": context["endpoint"],
        "audience": context["audience"],
        "stationToken": context["stationToken"],
        "senderId": context["senderId"],
        "discoveredFrom": discovered_from,
        "lastSeq": 0,
        "lastScanAt": None,
    }


def derive_targets(local_state: Any, state: JsonDict) -> Dict[str, JsonDict]:
    targets = dict(state.get("targets") or {})
    contexts = resolve_station_contexts(local_state)

    for context in contexts:
        space_id = context.get("spaceId")
        if isinstance(space_id, str) and space_id:
            targets.setdefault(space_id, base_target(space_id, "space", context, "known-stations"))

    transcript = parse_transcript(local_state.transcript)

    def lookup_context(parent_id: Optional[str]) -> Optional[JsonDict]:
        if isinstance(parent_id, str):
            target = targets.get(parent_id)
            if isinstance(target, dict):
                return target
            for context in contexts:
                if context.get("spaceId") == parent_id:
                    return context
            if parent_id == "root" and len(contexts) == 1:
                return contexts[0]
        return None

    for entry in transcript:
        if entry.get("direction") != "out":
            continue
        message = entry.get("message")
        if not isinstance(message, dict):
            continue
        if message.get("type") == "INTENT":
            intent_id = message.get("intentId")
            context = lookup_context(message.get("parentId"))
            if isinstance(intent_id, str) and intent_id and context:
                targets.setdefault(intent_id, base_target(intent_id, "intent", context, "transcript.intent"))
        elif message.get("type") == "ACCEPT":
            parent_id = message.get("parentId")
            context = lookup_context(parent_id)
            if isinstance(parent_id, str) and parent_id and context:
                targets.setdefault(parent_id, base_target(parent_id, "intent", context, "transcript.accept"))

    return targets


def queue_event(state: JsonDict, event: JsonDict) -> None:
    queued = state.setdefault("queuedEvents", [])
    if not isinstance(queued, list):
        state["queuedEvents"] = queued = []
    queued.append(event)


def relevant_messages(messages: Iterable[JsonDict], sender_id: str) -> List[JsonDict]:
    relevant: List[JsonDict] = []
    for message in messages:
        if not isinstance(message, dict):
            continue
        if message.get("senderId") == sender_id:
            continue
        if not isinstance(message.get("type"), str):
            continue
        relevant.append(message)
    return relevant


def scan_target(sdk: Any, local_state: Any, target: JsonDict) -> JsonDict:
    client = sdk.StationClient(target["endpoint"], local_state)
    try:
        client.connect()
        client.authenticate(
            sender_id=target["senderId"],
            station_token=target["stationToken"],
            audience=target["audience"],
            local_state=local_state,
        )
        return client.scan_from(target["id"], since=int(target.get("lastSeq") or 0), persist_cursor=False)
    finally:
        client.close()


def tick(paths: Paths, state: JsonDict) -> JsonDict:
    sdk_dir = Path(str(state["config"]["sdkDir"]))
    sdk = load_sdk(sdk_dir)
    local_state = sdk.LocalState(paths.workspace)
    local_state.ensure_dirs()

    state["targets"] = derive_targets(local_state, state)
    for target_id, target in list(state["targets"].items()):
        if not isinstance(target, dict):
            continue
        try:
            result = scan_target(sdk, local_state, target)
        except Exception as exc:  # noqa: BLE001
            state["lastError"] = {
                "at": now_ms(),
                "targetId": target_id,
                "message": str(exc),
            }
            continue

        target["lastSeq"] = result.get("latestSeq", target.get("lastSeq", 0))
        target["lastScanAt"] = now_ms()
        messages = result.get("messages", [])
        if isinstance(messages, list):
            for message in relevant_messages(messages, str(target["senderId"])):
                queue_event(
                    state,
                    {
                        "queuedAt": now_ms(),
                        "targetId": target_id,
                        "targetKind": target["kind"],
                        "message": message,
                    },
                )

    state["lastTickAt"] = now_ms()
    return state


def pid_is_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def write_pid(paths: Paths, pid: int) -> None:
    ensure_dir(paths.spaced_dir)
    paths.pid_file.write_text(f"{pid}\n", encoding="utf-8")


def read_pid(paths: Paths) -> Optional[int]:
    if not paths.pid_file.exists():
        return None
    text = paths.pid_file.read_text(encoding="utf-8").strip()
    if not text:
        return None
    return int(text)


def start(args: argparse.Namespace) -> int:
    paths = Paths(workspace=args.workspace.resolve())
    ensure_dir(paths.spaced_dir)
    existing_pid = read_pid(paths)
    if existing_pid and pid_is_alive(existing_pid):
        print(json.dumps({"status": "already-running", "pid": existing_pid}))
        return 0

    state = load_state(paths, sdk_dir=args.sdk_dir.resolve(), interval=args.interval)
    state["startedAt"] = now_ms()
    save_state(paths, state)

    with paths.log_file.open("a", encoding="utf-8") as log_handle:
        process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "spaced.cli",
                "run",
                "--workspace",
                str(paths.workspace),
                "--sdk-dir",
                str(args.sdk_dir.resolve()),
                "--interval",
                str(args.interval),
            ],
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
    write_pid(paths, process.pid)
    print(json.dumps({"status": "started", "pid": process.pid, "workspace": str(paths.workspace)}))
    return 0


def run_daemon(args: argparse.Namespace) -> int:
    paths = Paths(workspace=args.workspace.resolve())
    state = load_state(paths, sdk_dir=args.sdk_dir.resolve(), interval=args.interval)
    ensure_dir(paths.spaced_dir)
    write_pid(paths, os.getpid())
    keep_running = True

    def handle_stop(_signum: int, _frame: Any) -> None:
        nonlocal keep_running
        keep_running = False

    signal.signal(signal.SIGTERM, handle_stop)
    signal.signal(signal.SIGINT, handle_stop)

    try:
        while keep_running:
            try:
                state = tick(paths, state)
                save_state(paths, state)
            except Exception as exc:  # noqa: BLE001
                state["lastError"] = {"at": now_ms(), "message": str(exc)}
                save_state(paths, state)
            time.sleep(args.interval)
    finally:
        pid = read_pid(paths)
        if pid == os.getpid() and paths.pid_file.exists():
            paths.pid_file.unlink()
    return 0


def status(args: argparse.Namespace) -> int:
    paths = Paths(workspace=args.workspace.resolve())
    state = load_state(paths)
    pid = read_pid(paths)
    print(
        json.dumps(
            {
                "workspace": str(paths.workspace),
                "pid": pid,
                "running": bool(pid and pid_is_alive(pid)),
                "config": state.get("config", {}),
                "startedAt": state.get("startedAt"),
                "lastTickAt": state.get("lastTickAt"),
                "lastError": state.get("lastError"),
                "targetCount": len(state.get("targets", {})),
                "queuedEventCount": len(state.get("queuedEvents", [])),
            },
            indent=2,
        )
    )
    return 0


def stop(args: argparse.Namespace) -> int:
    paths = Paths(workspace=args.workspace.resolve())
    pid = read_pid(paths)
    if not pid:
        print(json.dumps({"status": "not-running"}))
        return 0
    if pid_is_alive(pid):
        os.kill(pid, signal.SIGTERM)
    if paths.pid_file.exists():
        paths.pid_file.unlink()
    print(json.dumps({"status": "stopped", "pid": pid}))
    return 0


def drain(args: argparse.Namespace) -> int:
    paths = Paths(workspace=args.workspace.resolve())
    state = load_state(paths)
    queued = state.get("queuedEvents", [])
    if not isinstance(queued, list):
        queued = []
    limit = args.limit if args.limit is not None else len(queued)
    selected = queued[:limit]
    remaining = queued[limit:]
    print(json.dumps(selected, indent=2))
    state["queuedEvents"] = remaining
    save_state(paths, state)
    return 0


def parser() -> argparse.ArgumentParser:
    argument_parser = argparse.ArgumentParser(prog="spaced")
    subparsers = argument_parser.add_subparsers(dest="command", required=True)

    def add_common(command: argparse.ArgumentParser) -> None:
        command.add_argument("--workspace", type=Path, required=True)

    start_parser = subparsers.add_parser("start")
    add_common(start_parser)
    start_parser.add_argument("--sdk-dir", type=Path, default=Path("."))
    start_parser.add_argument("--interval", type=float, default=1.0)
    start_parser.set_defaults(func=start)

    run_parser = subparsers.add_parser("run")
    add_common(run_parser)
    run_parser.add_argument("--sdk-dir", type=Path, default=Path("."))
    run_parser.add_argument("--interval", type=float, default=1.0)
    run_parser.set_defaults(func=run_daemon)

    status_parser = subparsers.add_parser("status")
    add_common(status_parser)
    status_parser.set_defaults(func=status)

    stop_parser = subparsers.add_parser("stop")
    add_common(stop_parser)
    stop_parser.set_defaults(func=stop)

    drain_parser = subparsers.add_parser("drain")
    add_common(drain_parser)
    drain_parser.add_argument("--limit", type=int, default=None)
    drain_parser.set_defaults(func=drain)

    return argument_parser


def main() -> int:
    args = parser().parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
