#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from pathlib import Path
from statistics import mean
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
COMMONS_SPACE_ID = "headwaters-commons"
STEWARD_ID = "headwaters-steward"


def install_runtime_path() -> None:
    candidates = [
        SCRIPT_DIR,
        SCRIPT_DIR.parent / "sdk",
        SCRIPT_DIR.parent.parent / "academy" / "skill-pack" / "sdk",
    ]
    for candidate in candidates:
        if (candidate / "promise_runtime.py").exists():
            sys.path.insert(0, str(candidate))
            return
    raise RuntimeError("Could not locate promise_runtime.py")


install_runtime_path()

from promise_runtime import PromiseRuntimeSession  # noqa: E402


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--headwaters-url", required=True)
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--count", type=int, required=True)
    parser.add_argument("--start-index", type=int, default=1)
    parser.add_argument("--workspace-root", default="/tmp/headwaters-ramp")
    parser.add_argument("--prefix", default="load-agent")
    parser.add_argument("--output", default=None)
    parser.add_argument("--wait-seconds", type=float, default=20.0)
    parser.add_argument("--post-home-intent", action="store_true")
    return parser.parse_args(argv)


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    index = (len(ordered) - 1) * p
    lower = int(index)
    upper = min(lower + 1, len(ordered) - 1)
    weight = index - lower
    return ordered[lower] * (1.0 - weight) + ordered[upper] * weight


def run_agent(
    *,
    workspace: Path,
    headwaters_url: str,
    host: str,
    port: int,
    agent_id: str,
    wait_seconds: float,
    post_home_intent: bool,
) -> dict[str, Any]:
    if workspace.exists():
        shutil.rmtree(workspace)
    workspace.mkdir(parents=True, exist_ok=True)

    started_at = time.time()
    session = PromiseRuntimeSession(
        endpoint=f"tcp://{host}:{port}",
        workspace=workspace,
        agent_name=agent_id,
        agent_id=agent_id,
    )
    try:
        signup_started = time.time()
        session.signup(headwaters_url, handle=agent_id)
        signup_finished = time.time()

        commons_auth_started = time.time()
        session.connect()
        commons_auth_finished = time.time()

        request = session.post(
            session.intent(
                "Please create my home space.",
                parent_id=COMMONS_SPACE_ID,
                payload={
                    "requestedSpace": {"kind": "home"},
                    "spacePolicy": {
                        "visibility": "private",
                        "participants": [session.agent_id, STEWARD_ID],
                    },
                },
            ),
            step="ramp.request_home_space",
        )

        promise = session.wait_for_promise(
            request["intentId"],
            sender_id=STEWARD_ID,
            wait_seconds=wait_seconds,
        )

        session.post(
            session.accept(
                promise_id=promise["promiseId"],
                parent_id=request["intentId"],
            ),
            step="ramp.accept_home_space_promise",
        )

        outcome = session.wait_or_scan(
            request["intentId"],
            lambda message: (
                message.get("senderId") == STEWARD_ID
                and message.get("parentId") == request["intentId"]
                and (
                    (message.get("type") == "COMPLETE" and message.get("promiseId") == promise["promiseId"])
                    or message.get("type") == "DECLINE"
                )
            ),
            wait_seconds=wait_seconds,
        )
        if outcome.get("type") == "DECLINE":
            payload = outcome.get("payload", {})
            reason_code = payload.get("reasonCode") if isinstance(payload, dict) else None
            return {
                "agentId": agent_id,
                "status": "declined",
                "workspace": str(workspace),
                "reasonCode": reason_code,
                "decline": outcome,
                "startedAt": started_at,
                "finishedAt": time.time(),
            }

        complete = outcome

        payload = complete.get("payload", {})
        endpoint = payload.get("station_endpoint")
        audience = payload.get("station_audience")
        station_token = payload.get("station_token")
        if not isinstance(endpoint, str) or not isinstance(audience, str) or not isinstance(station_token, str):
            raise RuntimeError(f"invalid completion payload: {payload}")

        session.post(
            session.assess(
                promise_id=promise["promiseId"],
                parent_id=request["intentId"],
                assessment="FULFILLED",
            ),
            step="ramp.assess_home_space_promise",
        )

        connect_home_started = time.time()
        session.connect_to(
            endpoint=endpoint,
            station_token=station_token,
            audience=audience,
        )
        connect_home_finished = time.time()

        if post_home_intent:
            session.post(
                session.intent("hello from ramp", parent_id=str(payload["spaceId"])),
                step="ramp.post_home_intent",
            )
            session.scan(str(payload["spaceId"]))

        finished_at = time.time()
        return {
            "agentId": agent_id,
            "status": "ok",
            "workspace": str(workspace),
            "spaceId": payload.get("spaceId"),
            "station_audience": audience,
            "startedAt": started_at,
            "finishedAt": finished_at,
            "durations": {
                "signupSeconds": signup_finished - signup_started,
                "commonsAuthSeconds": commons_auth_finished - commons_auth_started,
                "homeConnectSeconds": connect_home_finished - connect_home_started,
                "totalSeconds": finished_at - started_at,
            },
        }
    finally:
        session.close()


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    successes = [result for result in results if result.get("status") == "ok"]
    failures = [result for result in results if result.get("status") != "ok"]
    totals = [float(result["durations"]["totalSeconds"]) for result in successes]
    return {
        "attempted": len(results),
        "succeeded": len(successes),
        "failed": len(failures),
        "averageTotalSeconds": mean(totals) if totals else 0.0,
        "p95TotalSeconds": percentile(totals, 0.95) if totals else 0.0,
        "failures": [
            {
                "agentId": result.get("agentId"),
                "status": result.get("status"),
                "error": result.get("error"),
                "reasonCode": result.get("reasonCode"),
            }
            for result in failures
        ],
    }


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    workspace_root = Path(args.workspace_root)
    workspace_root.mkdir(parents=True, exist_ok=True)

    results: list[dict[str, Any]] = []
    for offset in range(args.count):
        index = args.start_index + offset
        agent_id = f"{args.prefix}-{index:04d}"
        workspace = workspace_root / agent_id
        try:
            result = run_agent(
                workspace=workspace,
                headwaters_url=args.headwaters_url,
                host=args.host,
                port=args.port,
                agent_id=agent_id,
                wait_seconds=args.wait_seconds,
                post_home_intent=args.post_home_intent,
            )
            if result.get("status") == "declined":
                print(f"[declined] {agent_id} {result.get('reasonCode') or 'UNKNOWN'}")
            else:
                print(f"[ok] {agent_id} {result['durations']['totalSeconds']:.3f}s")
            results.append(result)
        except Exception as error:  # noqa: BLE001
            print(f"[fail] {agent_id} {error}", file=sys.stderr)
            results.append(
                {
                    "agentId": agent_id,
                    "status": "error",
                    "error": str(error),
                    "workspace": str(workspace),
                }
            )

    report = {
        "headwatersUrl": args.headwaters_url,
        "host": args.host,
        "port": args.port,
        "count": args.count,
        "startIndex": args.start_index,
        "postHomeIntent": args.post_home_intent,
        "summary": summarize(results),
        "results": results,
    }
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))
    return 0 if report["summary"]["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
