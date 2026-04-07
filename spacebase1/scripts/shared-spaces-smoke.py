#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict


def load_sdk() -> None:
    candidates = []
    if "INTENT_SPACE_SDK_PATH" in os.environ:
        candidates.append(Path(os.environ["INTENT_SPACE_SDK_PATH"]))
    candidates.extend([
        Path.home() / ".claude" / "skills" / "intent-space-agent-pack" / "sdk",
        Path.home() / ".codex" / "skills" / "intent-space-agent-pack" / "sdk",
        Path("marketplace") / "plugins" / "intent-space-agent-pack" / "sdk",
    ])
    for candidate in candidates:
        if candidate.exists():
            sys.path.insert(0, str(candidate))
            return
    raise RuntimeError("Could not locate the intent-space-agent-pack sdk directory.")


load_sdk()

from http_space_tools import HttpSpaceToolSession  # type: ignore  # noqa: E402


JsonDict = Dict[str, Any]


def make_session(root: Path, commons_url: str, name: str) -> HttpSpaceToolSession:
    return HttpSpaceToolSession(endpoint=commons_url, workspace=root / name, agent_name=name)


def self_service_home(root: Path, commons_url: str, name: str) -> JsonDict:
    session = make_session(root, commons_url, name)
    session.signup(commons_url)
    session.connect()
    session.confirm_current_space()

    request = session.post_and_confirm(
        session.intent(
            "Please provision one home space for me.",
            parent_id="commons",
            payload={
                "requestedSpace": {"kind": "home"},
                "spacePolicy": {"visibility": "private"},
            },
        ),
        step="intent.provision-home-space",
        confirm_space_id="commons",
    )
    request_space = request["intentId"]
    promise = session.wait_for_promise(request_space, wait_seconds=15.0)
    session.post_and_confirm(
        session.accept(promise_id=promise["promiseId"], parent_id=request_space),
        step="accept.provision-home-space",
        confirm_space_id=request_space,
    )
    complete = session.wait_for_complete(request_space, promise_id=promise["promiseId"], wait_seconds=20.0)
    claim_url = complete["payload"]["claim_url"]
    home_space_id = complete["payload"]["home_space_id"]

    session.signup(claim_url)
    session.connect()
    binding = session.verify_space_binding()
    identity = session.identity_info()

    return {
        "session": session,
        "binding": binding,
        "identity": identity,
        "home_space_id": home_space_id,
        "principal_id": identity["principalId"],
    }


def find_invitation(session: HttpSpaceToolSession, home_space_id: str, shared_space_id: str) -> JsonDict:
    scan = session.scan_full(home_space_id)
    for message in scan.get("messages", []):
        payload = message.get("payload")
        if message.get("type") == "INTENT" and isinstance(payload, dict) and payload.get("shared_space_id") == shared_space_id:
            return message
    raise RuntimeError(f"No invitation found in {home_space_id} for {shared_space_id}")


def connect_from_invite(actor: JsonDict, invite: JsonDict) -> JsonDict:
    access = invite["payload"]["access"]
    actor["session"].connect_to(
        endpoint=access["itp_endpoint"],
        station_token=access["station_token"],
        audience=access["audience"],
        sender_id=actor["principal_id"],
    )
    return actor["session"].verify_space_binding()


def main() -> int:
    base = os.environ.get("SPACEBASE1_BASE_URL", "http://127.0.0.1:8814").rstrip("/")
    commons_url = f"{base}/commons"
    root = Path(tempfile.mkdtemp(prefix="spacebase1-shared-smoke-"))

    alice = self_service_home(root, commons_url, "agent-alice")
    bob = self_service_home(root, commons_url, "agent-bob")
    eve = self_service_home(root, commons_url, "agent-eve")

    participant_principals = sorted([alice["principal_id"], bob["principal_id"]])
    request = alice["session"].post_and_confirm(
        alice["session"].intent(
            "Please provision one shared space for this peer set.",
            parent_id=alice["home_space_id"],
            payload={
                "requestedSpace": {
                    "kind": "shared",
                    "participant_principals": participant_principals,
                },
            },
        ),
        step="intent.provision-shared-space",
        confirm_space_id=alice["home_space_id"],
    )
    request_space = request["intentId"]
    promise = alice["session"].wait_for_promise(request_space, wait_seconds=15.0)
    alice["session"].post_and_confirm(
        alice["session"].accept(promise_id=promise["promiseId"], parent_id=request_space),
        step="accept.provision-shared-space",
        confirm_space_id=request_space,
    )
    complete = alice["session"].wait_for_complete(request_space, promise_id=promise["promiseId"], wait_seconds=20.0)
    shared_space_id = complete["payload"]["shared_space_id"]

    alice_invite = find_invitation(alice["session"], alice["home_space_id"], shared_space_id)
    bob_invite = find_invitation(bob["session"], bob["home_space_id"], shared_space_id)

    alice_shared_binding = connect_from_invite(alice, alice_invite)
    bob_shared_binding = connect_from_invite(bob, bob_invite)

    posted = alice["session"].post_and_confirm(
        alice["session"].intent(
            "hello from alice in shared space",
            parent_id=shared_space_id,
            payload={"kind": "shared-smoke"},
        ),
        step="intent.shared-space-smoke",
        confirm_space_id=shared_space_id,
    )

    seen = bob["session"].wait_for_intent(
        shared_space_id,
        sender_id=alice["principal_id"],
        payload_predicate=lambda payload: payload.get("kind") == "shared-smoke",
        wait_seconds=10.0,
    )

    outsider_scan = eve["session"].scan_full(shared_space_id)
    outsider_denied = len(outsider_scan.get("messages", [])) == 0
    if not outsider_denied:
        raise RuntimeError("Outsider unexpectedly observed messages in the shared space.")

    summary = {
        "workspace": str(root),
        "alice_principal": alice["principal_id"],
        "bob_principal": bob["principal_id"],
        "eve_principal": eve["principal_id"],
        "alice_home_space_id": alice["home_space_id"],
        "bob_home_space_id": bob["home_space_id"],
        "eve_home_space_id": eve["home_space_id"],
        "shared_space_id": shared_space_id,
        "invitation_count": complete["payload"]["invitation_count"],
        "alice_invite_sender": alice_invite["senderId"],
        "bob_invite_sender": bob_invite["senderId"],
        "posted_intent": posted["intentId"],
        "seen_intent": seen["intentId"],
        "alice_shared_binding": alice_shared_binding,
        "bob_shared_binding": bob_shared_binding,
        "outsider_denied": outsider_denied,
    }
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
