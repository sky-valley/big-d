#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
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
        if (candidate / "promise_runtime.py").exists() and (candidate / "intent_space_sdk.py").exists():
            sys.path.insert(0, str(candidate))
            return
    raise RuntimeError("Could not locate promise_runtime.py and intent_space_sdk.py")


install_runtime_path()

from promise_runtime import PromiseRuntimeSession  # noqa: E402
from intent_space_sdk import LocalState, StationClient  # noqa: E402


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--headwaters-url", required=True)
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--workspace", default="/tmp/headwaters-connection-ramp")
    parser.add_argument("--agent-id", default="connection-ramp-agent")
    parser.add_argument("--connections", type=int, required=True)
    parser.add_argument("--scans-per-connection", type=int, default=1)
    parser.add_argument("--wait-seconds", type=float, default=20.0)
    parser.add_argument("--hold-seconds", type=float, default=0.0)
    parser.add_argument("--space", choices=["home", "commons"], default="home")
    parser.add_argument("--output", default=None)
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


def ensure_bindings(
    *,
    workspace: Path,
    headwaters_url: str,
    host: str,
    port: int,
    agent_id: str,
    wait_seconds: float,
    include_home: bool,
) -> dict[str, Any]:
    if workspace.exists():
        shutil.rmtree(workspace)
    workspace.mkdir(parents=True, exist_ok=True)

    session = PromiseRuntimeSession(
        endpoint=f"tcp://{host}:{port}",
        workspace=workspace,
        agent_name=agent_id,
        agent_id=agent_id,
    )
    try:
        session.signup(headwaters_url, handle=agent_id)
        session.connect()
        commons_enrollment = session.local_state.load_enrollment()
        bindings: dict[str, Any] = {
            "workspace": str(workspace),
            "agentId": agent_id,
            "commons": {
                "endpoint": commons_enrollment.get("station_endpoint"),
                "audience": commons_enrollment.get("station_audience"),
                "stationToken": commons_enrollment.get("station_token"),
                "spaceId": commons_enrollment.get("commons_space_id"),
                "scanSpaceId": COMMONS_SPACE_ID,
            },
        }
        if not include_home:
            return bindings

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
            step="connection_ramp.request_home_space",
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
            step="connection_ramp.accept_home_space_promise",
        )
        complete = session.wait_for_complete(
            request["intentId"],
            promise_id=promise["promiseId"],
            sender_id=STEWARD_ID,
            wait_seconds=wait_seconds,
        )
        payload = complete.get("payload", {})
        endpoint = payload.get("stationEndpoint")
        audience = payload.get("stationAudience")
        station_token = payload.get("stationToken")
        if not isinstance(endpoint, str) or not isinstance(audience, str) or not isinstance(station_token, str):
            raise RuntimeError(f"invalid completion payload: {payload}")
        session.post(
            session.assess(
                promise_id=promise["promiseId"],
                parent_id=request["intentId"],
                assessment="FULFILLED",
            ),
            step="connection_ramp.assess_home_space_promise",
        )
        bindings["home"] = {
            "endpoint": endpoint,
            "audience": audience,
            "stationToken": station_token,
            "spaceId": payload.get("spaceId"),
            "scanSpaceId": "root",
        }
        return bindings
    finally:
        session.close()


def run_connection(
    *,
    workspace: Path,
    endpoint: str,
    audience: str,
    station_token: str,
    agent_id: str,
    scan_space_id: str,
    scans_per_connection: int,
    hold_seconds: float,
    connection_index: int,
) -> dict[str, Any]:
    local_state = LocalState(workspace)
    client = StationClient(endpoint, local_state)
    started_at = time.time()
    auth_finished = None
    try:
        client.connect()
        client.authenticate(
            sender_id=agent_id,
            station_token=station_token,
            audience=audience,
            local_state=local_state,
        )
        auth_finished = time.time()
        latest_seq = None
        for _ in range(scans_per_connection):
            scan_result = client.scan(scan_space_id)
            latest_seq = scan_result.get("latestSeq")
        if hold_seconds > 0:
            time.sleep(hold_seconds)
        finished_at = time.time()
        return {
            "connectionIndex": connection_index,
            "status": "ok",
            "startedAt": started_at,
            "finishedAt": finished_at,
            "durations": {
                "authSeconds": (auth_finished or finished_at) - started_at,
                "totalSeconds": finished_at - started_at,
            },
            "latestSeq": latest_seq,
        }
    finally:
        client.close()


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    successes = [result for result in results if result.get("status") == "ok"]
    failures = [result for result in results if result.get("status") != "ok"]
    auths = [float(result["durations"]["authSeconds"]) for result in successes]
    totals = [float(result["durations"]["totalSeconds"]) for result in successes]
    return {
        "attempted": len(results),
        "succeeded": len(successes),
        "failed": len(failures),
        "averageAuthSeconds": mean(auths) if auths else 0.0,
        "p95AuthSeconds": percentile(auths, 0.95) if auths else 0.0,
        "averageTotalSeconds": mean(totals) if totals else 0.0,
        "p95TotalSeconds": percentile(totals, 0.95) if totals else 0.0,
        "failures": [
            {
                "connectionIndex": result.get("connectionIndex"),
                "error": result.get("error"),
            }
            for result in failures
        ],
    }


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    workspace = Path(args.workspace)
    bindings = ensure_bindings(
        workspace=workspace,
        headwaters_url=args.headwaters_url,
        host=args.host,
        port=args.port,
        agent_id=args.agent_id,
        wait_seconds=args.wait_seconds,
        include_home=args.space == "home",
    )

    target = bindings[args.space]
    results: list[dict[str, Any]] = []
    lock = threading.Lock()

    with ThreadPoolExecutor(max_workers=args.connections) as executor:
        future_to_index = {
            executor.submit(
                run_connection,
                workspace=workspace,
                endpoint=str(target["endpoint"]),
                audience=str(target["audience"]),
                station_token=str(target["stationToken"]),
                agent_id=args.agent_id,
                scan_space_id=str(target["scanSpaceId"]),
                scans_per_connection=args.scans_per_connection,
                hold_seconds=args.hold_seconds,
                connection_index=index + 1,
            ): index + 1
            for index in range(args.connections)
        }
        for future in as_completed(future_to_index):
            connection_index = future_to_index[future]
            try:
                result = future.result()
                with lock:
                    results.append(result)
                print(
                    f"[ok] connection-{result['connectionIndex']:03d} "
                    f"auth={result['durations']['authSeconds']:.3f}s total={result['durations']['totalSeconds']:.3f}s"
                )
            except Exception as error:  # noqa: BLE001
                failed = {
                    "connectionIndex": connection_index,
                    "status": "error",
                    "error": str(error),
                }
                with lock:
                    results.append(failed)
                print(f"[fail] connection {error}", file=sys.stderr)

    report = {
        "headwatersUrl": args.headwaters_url,
        "space": args.space,
        "connections": args.connections,
        "scansPerConnection": args.scans_per_connection,
        "holdSeconds": args.hold_seconds,
        "binding": bindings,
        "summary": summarize(results),
        "results": sorted(results, key=lambda item: int(item.get("connectionIndex", 0))),
    }
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))
    return 0 if report["summary"]["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
