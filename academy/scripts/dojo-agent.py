#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_SDK_DIR = SCRIPT_DIR.parent / "skill-pack" / "sdk"
sys.path.insert(0, str(SKILL_SDK_DIR))

from promise_runtime import PromiseRuntimeSession  # noqa: E402


TUTORIAL_SPACE_ID = "tutorial"
RITUAL_GREETING_CONTENT = "academy tutorial greeting"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4000)
    parser.add_argument("--academy-url", default="http://127.0.0.1:8080")
    parser.add_argument("--agent-id", default=None)
    parser.add_argument("--agent-name", default=None)
    parser.add_argument("--workspace", default=None)
    return parser.parse_args(argv)


def log(step: str, detail: str | None = None) -> None:
    print(f"dojo-agent: {step}{f' {detail}' if detail else ''}", flush=True)


def save_if_present(session: PromiseRuntimeSession, filename: str, payload: Any) -> None:
    if isinstance(payload, dict):
        session.save_json_artifact(filename, payload)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    workspace = Path(args.workspace or SCRIPT_DIR.parent / "tmp" / "dojo-agent")
    agent_name = args.agent_name or args.agent_id or "dojo-agent"
    session = PromiseRuntimeSession(
        endpoint=f"tcp://{args.host}:{args.port}",
        workspace=workspace,
        agent_name=agent_name,
        agent_id=args.agent_id,
    )
    identity = session.identity()
    try:
        signup = session.signup(args.academy_url, handle=session.agent_id)
        endpoint = str(session.endpoint)
        session.connect()
        session.record_step("dojo.start", {"workspace": str(workspace), "endpoint": endpoint, "academyUrl": args.academy_url})
        session.save_json_artifact("session-start.json", session.snapshot())
        log("connected", f"(agent={session.agent_id})")

        root_scan = session.scan("root")
        save_if_present(session, "root-scan.json", root_scan)

        greeting = session.post(
            session.intent(RITUAL_GREETING_CONTENT, parent_id=TUTORIAL_SPACE_ID),
            step="dojo.tutorial.post_greeting",
            artifact_filename="tutorial-greeting.json",
        )
        greeting_space = greeting["intentId"]
        log("posted ritual greeting", greeting_space)

        tutorial_scan = session.wait_for_intent(
            greeting_space,
            sender_id="differ-tutor",
            payload_predicate=lambda payload: payload.get("nextStep") == "enter-subspace",
            wait_seconds=20.0,
        )
        save_if_present(session, "tutorial-scan.json", tutorial_scan)
        session.record_step("dojo.tutorial.greeting_acknowledged", {"intentId": tutorial_scan.get("intentId")})
        log("entered greeting subspace")

        first_ask = session.post(
            session.intent("I want to try the first tutorial move", parent_id=greeting_space),
            step="dojo.tutorial.post_first_attempt",
        )
        log("posted first tutorial intent")

        decline = session.wait_for_decline(
            greeting_space,
            intent_id=first_ask["intentId"],
            wait_seconds=20.0,
        )
        save_if_present(session, "tutorial-decline.json", decline)
        session.record_step("dojo.tutorial.decline_received", {"intentId": decline.get("intentId")})
        log("received deliberate decline")

        corrected = session.post(
            session.intent(
                "Please guide me through the station ritual with an explicit promise I can accept.",
                parent_id=greeting_space,
            ),
            step="dojo.tutorial.post_corrected_intent",
        )
        log("posted corrected tutorial intent")

        promise = session.wait_for_promise(
            greeting_space,
            payload_predicate=lambda payload: isinstance(payload, dict),
            wait_seconds=20.0,
        )
        save_if_present(session, "tutorial-promise.json", promise)
        promise_id = promise["promiseId"]
        session.record_step("dojo.tutorial.promise_received", {"promiseId": promise_id})
        log("received promise", promise_id)

        accept = session.post(
            session.accept(promise_id=promise_id, parent_id=greeting_space),
            step="dojo.tutorial.post_accept",
            artifact_filename="tutorial-accept.json",
        )
        log("accepted promise")

        complete = session.wait_for_complete(
            greeting_space,
            promise_id=promise_id,
            wait_seconds=20.0,
        )
        save_if_present(session, "tutorial-complete.json", complete)
        session.record_step("dojo.tutorial.complete_received", {"promiseId": promise_id})
        log("received complete")

        assess = session.post(
            session.assess(
                promise_id=promise_id,
                parent_id=greeting_space,
                assessment="FULFILLED",
            ),
            step="dojo.tutorial.post_assess",
            artifact_filename="tutorial-assess.json",
        )
        log("posted assess FULFILLED")

        final_ack = session.wait_for_intent(
            greeting_space,
            sender_id="differ-tutor",
            payload_predicate=lambda payload: payload.get("content")
            == "Tutorial complete. You can now proceed beyond the ritual.",
            wait_seconds=20.0,
        )
        save_if_present(session, "tutorial-final-ack.json", final_ack)
        session.record_step("dojo.tutorial.final_ack_received", {"intentId": final_ack.get("intentId")})
        reward = final_ack.get("payload", {}).get("dojoReward") if isinstance(final_ack.get("payload"), dict) else None
        certificate = final_ack.get("payload", {}).get("dojoCertificate") if isinstance(final_ack.get("payload"), dict) else None
        if isinstance(reward, dict):
            session.save_json_artifact("dojo-token.txt.json", reward)
        if isinstance(certificate, dict):
            session.save_json_artifact("dojo-certificate.json", certificate)
        session.record_step("dojo.complete", {"reward": isinstance(reward, dict), "certificate": isinstance(certificate, dict)})
        session.save_json_artifact("session-finish.json", session.snapshot())
        log("happy path complete")
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
