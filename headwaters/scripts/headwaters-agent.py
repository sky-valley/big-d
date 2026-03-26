#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent

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
    raise RuntimeError("Could not locate promise_runtime.py next to the reference agent, in ../sdk, or in the repo academy pack")


install_runtime_path()

from promise_runtime import PromiseRuntimeSession  # noqa: E402


COMMONS_SPACE_ID = "headwaters-commons"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--headwaters-url", default=os.environ.get("HEADWATERS_URL", "http://127.0.0.1:8090"))
    parser.add_argument("--host", default=os.environ.get("HEADWATERS_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("HEADWATERS_COMMONS_PORT", "4010")))
    parser.add_argument("--agent-id", default=None)
    parser.add_argument("--agent-name", default=None)
    parser.add_argument("--workspace", default=None)
    return parser.parse_args(argv)


def save_if_present(session: PromiseRuntimeSession, filename: str, payload: Any) -> None:
    if isinstance(payload, dict):
        session.save_json_artifact(filename, payload)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    workspace = Path(args.workspace or SCRIPT_DIR.parent / "tmp" / "headwaters-agent")
    agent_name = args.agent_name or args.agent_id or "headwaters-agent"
    session = PromiseRuntimeSession(
        endpoint=f"tcp://{args.host}:{args.port}",
        workspace=workspace,
        agent_name=agent_name,
        agent_id=args.agent_id,
    )
    try:
        session.signup(args.headwaters_url, handle=session.agent_id)
        session.connect()
        session.record_step("headwaters.start", {"headwatersUrl": args.headwaters_url, "endpoint": session.endpoint})

        request = session.post(
            session.intent(
                "Please create my home space.",
                parent_id=COMMONS_SPACE_ID,
                payload={
                    "requestedSpace": {"kind": "home"},
                    "spacePolicy": {
                        "visibility": "private",
                        "participants": [session.agent_id, "headwaters-steward"],
                    },
                },
            ),
            step="headwaters.request_home_space",
            artifact_filename="headwaters-home-request.json",
        )

        promise = session.wait_for_promise(
            request["intentId"],
            sender_id="headwaters-steward",
            wait_seconds=20.0,
        )
        save_if_present(session, "headwaters-home-promise.json", promise)

        accepted = session.post(
            session.accept(
                promise_id=promise["promiseId"],
                parent_id=request["intentId"],
            ),
            step="headwaters.accept_home_space_promise",
            artifact_filename="headwaters-home-accept.json",
        )
        save_if_present(session, "headwaters-home-accept-echo.json", accepted)

        reply = session.wait_for_complete(
            request["intentId"],
            promise_id=promise["promiseId"],
            sender_id="headwaters-steward",
            wait_seconds=20.0,
        )
        save_if_present(session, "headwaters-home-complete.json", reply)
        payload = reply.get("payload", {})
        endpoint = payload.get("station_endpoint")
        audience = payload.get("station_audience")
        station_token = payload.get("station_token")
        if not isinstance(endpoint, str) or not isinstance(audience, str) or not isinstance(station_token, str):
            raise RuntimeError(f"invalid headwaters reply payload: {payload}")

        session.post(
            session.assess(
                promise_id=promise["promiseId"],
                parent_id=request["intentId"],
                assessment="FULFILLED",
            ),
            step="headwaters.assess_home_space_promise",
            artifact_filename="headwaters-home-assess.json",
        )

        session.connect_to(
            endpoint=endpoint,
            station_token=station_token,
            audience=audience,
        )

        session.post(
            session.intent("hello from my home space", parent_id="root"),
            step="headwaters.post_home_intent",
            artifact_filename="headwaters-home-intent.json",
        )
        home_scan = session.scan("root")
        save_if_present(session, "headwaters-home-scan.json", home_scan)
        session.save_json_artifact("session-finish.json", session.snapshot())
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
