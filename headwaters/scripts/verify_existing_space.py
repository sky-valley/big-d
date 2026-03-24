#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent


def install_runtime_path() -> None:
    candidates = [
        SCRIPT_DIR,
        SCRIPT_DIR.parent / "sdk",
        SCRIPT_DIR.parent.parent / "academy" / "skill-pack" / "sdk",
    ]
    for candidate in candidates:
        if (candidate / "promise_runtime.py").exists() and (candidate / "intent_space_sdk.py").exists():
            sys.path.insert(0, str(candidate))
            return
    raise RuntimeError("Could not locate promise_runtime.py and intent_space_sdk.py")


install_runtime_path()

from promise_runtime import PromiseRuntimeSession  # noqa: E402


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--post-message", default=None)
    parser.add_argument("--output", default=None)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    workspace = Path(args.workspace).resolve()
    state_dir = workspace / ".intent-space" / "state"
    enrollment = json.loads((state_dir / "station-enrollment.json").read_text(encoding="utf-8"))
    stations = json.loads((state_dir / "known-stations.json").read_text(encoding="utf-8"))
    if not stations:
        raise RuntimeError(f"no known stations recorded in {state_dir}")

    target = stations[0]
    endpoint = target.get("endpoint")
    audience = target.get("audience")
    station_token = target.get("stationToken")
    sender_id = enrollment.get("handle")
    if not all(isinstance(value, str) and value for value in [endpoint, audience, station_token, sender_id]):
        raise RuntimeError(f"incomplete station binding in {state_dir}")

    session = PromiseRuntimeSession(
        endpoint=str(endpoint),
        workspace=workspace,
        agent_name=str(sender_id),
        agent_id=str(sender_id),
    )
    try:
        session.connect_to(
            endpoint=str(endpoint),
            station_token=str(station_token),
            audience=str(audience),
            sender_id=str(sender_id),
        )
        if args.post_message:
            session.post(
                session.intent(args.post_message, parent_id="root"),
                step="verify_existing_space.post",
                artifact_filename="verify-existing-space-intent.json",
            )
        scan = session.scan("root")
        report = {
            "workspace": str(workspace),
            "senderId": sender_id,
            "endpoint": endpoint,
            "audience": audience,
            "latestSeq": scan.get("latestSeq"),
            "messageCount": len(scan.get("messages", [])),
            "snapshot": session.snapshot(),
        }
        if args.output:
            output_path = Path(args.output)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, indent=2))
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
