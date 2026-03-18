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


REGISTRATION_SPACE_ID = "registration"
TUTORIAL_SPACE_ID = "tutorial"
REGISTRATION_INTENT_CONTENT = "I want to register as a participant in the internet intent space station"
RITUAL_GREETING_CONTENT = "academy tutorial greeting"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4000)
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
    endpoint = f"tcp://{args.host}:{args.port}"
    workspace = Path(args.workspace or SCRIPT_DIR.parent / "tmp" / "dojo-agent")
    agent_name = args.agent_name or args.agent_id or "dojo-agent"
    session = PromiseRuntimeSession(
        endpoint=endpoint,
        workspace=workspace,
        agent_name=agent_name,
        agent_id=args.agent_id,
    )
    session.ensure_identity()
    session.connect()
    try:
        log("connected", f"(agent={session.agent_id})")

        root_scan = session.scan("root")
        save_if_present(session, "root-scan.json", root_scan)

        registration = session.intent(
            REGISTRATION_INTENT_CONTENT,
            parent_id=REGISTRATION_SPACE_ID,
            payload={
                "agentName": session.agent_name,
                "publicKeyPem": session.local_state.public_key.read_text(),
                "fingerprint": session.local_state.fingerprint.read_text().strip(),
                "capabilities": ["scan", "post", "enter", "sign-challenge"],
                "academyVersion": "phase1",
            },
        )
        session.send(registration)
        save_if_present(session, "registration-intent.json", registration)
        registration_space = registration["intentId"]
        log("posted registration intent", registration_space)

        challenge = session.wait_or_scan(
            registration_space,
            lambda msg: msg.get("type") == "INTENT"
            and msg.get("parentId") == registration_space
            and msg.get("senderId") == "differ-tutor"
            and isinstance(msg.get("payload"), dict)
            and isinstance(msg["payload"].get("challenge"), str),
            wait_seconds=20.0,
        )
        save_if_present(session, "registration-challenge.json", challenge)
        log("received challenge")

        challenge_value = challenge["payload"]["challenge"]
        signed_response = session.intent(
            "Signed challenge response",
            parent_id=registration_space,
            payload={
                "challenge": challenge_value,
                "signatureBase64": session.sign_challenge(challenge_value),
            },
        )
        session.send(signed_response)
        save_if_present(session, "registration-response.json", signed_response)
        log("posted signed challenge response")

        registration_ack = session.wait_or_scan(
            registration_space,
            lambda msg: msg.get("parentId") == registration_space
            and msg.get("senderId") == "differ-tutor"
            and isinstance(msg.get("payload"), dict)
            and isinstance(msg["payload"].get("ritualGreeting"), str),
            wait_seconds=20.0,
        )
        save_if_present(session, "registration-ack.json", registration_ack)
        log("registration acknowledged")

        greeting = session.intent(RITUAL_GREETING_CONTENT, parent_id=TUTORIAL_SPACE_ID)
        session.send(greeting)
        save_if_present(session, "tutorial-greeting.json", greeting)
        greeting_space = greeting["intentId"]
        log("posted ritual greeting", greeting_space)

        tutorial_scan = session.wait_or_scan(
            greeting_space,
            lambda msg: msg.get("type") == "INTENT"
            and msg.get("senderId") == "differ-tutor"
            and isinstance(msg.get("payload"), dict)
            and msg["payload"].get("nextStep") == "enter-subspace",
            wait_seconds=20.0,
        )
        save_if_present(session, "tutorial-scan.json", tutorial_scan)
        log("entered greeting subspace")

        first_ask = session.intent("I want to try the first tutorial move", parent_id=greeting_space)
        session.send(first_ask)
        log("posted first tutorial intent")

        decline = session.wait_or_scan(
            greeting_space,
            lambda msg: msg.get("type") == "DECLINE"
            and msg.get("intentId") == first_ask["intentId"],
            wait_seconds=20.0,
        )
        save_if_present(session, "tutorial-decline.json", decline)
        log("received deliberate decline")

        corrected = session.intent(
            "Please guide me through the station ritual with an explicit promise I can accept.",
            parent_id=greeting_space,
        )
        session.send(corrected)
        log("posted corrected tutorial intent")

        promise = session.wait_or_scan(
            greeting_space,
            lambda msg: msg.get("type") == "PROMISE"
            and msg.get("parentId") == greeting_space
            and isinstance(msg.get("promiseId"), str),
            wait_seconds=20.0,
        )
        save_if_present(session, "tutorial-promise.json", promise)
        promise_id = promise["promiseId"]
        log("received promise", promise_id)

        accept = session.accept(promise_id=promise_id, parent_id=greeting_space)
        session.send(accept)
        save_if_present(session, "tutorial-accept.json", accept)
        log("accepted promise")

        complete = session.wait_or_scan(
            greeting_space,
            lambda msg: msg.get("type") == "COMPLETE"
            and msg.get("parentId") == greeting_space
            and msg.get("promiseId") == promise_id,
            wait_seconds=20.0,
        )
        save_if_present(session, "tutorial-complete.json", complete)
        log("received complete")

        assess = session.assess(
            promise_id=promise_id,
            parent_id=greeting_space,
            assessment="FULFILLED",
        )
        session.send(assess)
        save_if_present(session, "tutorial-assess.json", assess)
        log("posted assess FULFILLED")

        final_ack = session.wait_or_scan(
            greeting_space,
            lambda msg: msg.get("type") == "INTENT"
            and msg.get("senderId") == "differ-tutor"
            and isinstance(msg.get("payload"), dict)
            and msg["payload"].get("content") == "Tutorial complete. You can now proceed beyond the ritual.",
            wait_seconds=20.0,
        )
        save_if_present(session, "tutorial-final-ack.json", final_ack)
        reward = final_ack.get("payload", {}).get("dojoReward") if isinstance(final_ack.get("payload"), dict) else None
        certificate = final_ack.get("payload", {}).get("dojoCertificate") if isinstance(final_ack.get("payload"), dict) else None
        if isinstance(reward, dict):
            session.save_json_artifact("dojo-token.txt.json", reward)
        if isinstance(certificate, dict):
            session.save_json_artifact("dojo-certificate.json", certificate)
        log("happy path complete")
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
