#!/usr/bin/env python3
"""
Live demo: provision a fresh home space, print its Observatory URL, then post
one bad commons intent and one bad home-space intent so the DECLINE messages
are visible live in the browser.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path


def load_sdk() -> None:
    for candidate in [
        Path.home() / ".claude" / "skills" / "intent-space-agent-pack" / "sdk",
        Path.home() / ".codex" / "skills" / "intent-space-agent-pack" / "sdk",
    ]:
        if candidate.exists():
            sys.path.insert(0, str(candidate))
            return
    raise RuntimeError("intent-space-agent-pack sdk not found")


load_sdk()

from http_space_tools import HttpSpaceToolSession  # type: ignore  # noqa: E402


def main() -> int:
    base = os.environ.get("SPACEBASE1_BASE_URL", "http://127.0.0.1:8787").rstrip("/")
    commons_url = f"{base}/commons"
    root = Path(tempfile.mkdtemp(prefix="spacebase1-decline-demo-"))

    # --- commons bad intent (observatory for commons itself) ---
    probe = HttpSpaceToolSession(
        endpoint=commons_url, workspace=root / "agent-probe", agent_name="agent-probe"
    )
    signup_resp = probe.signup(commons_url)
    probe.connect()
    probe.confirm_current_space()
    commons_observatory = signup_resp.get("observatory_url") if isinstance(signup_resp, dict) else None

    probe.post_and_confirm(
        probe.intent(
            "Try to request a shared space from commons (should DECLINE).",
            parent_id="commons",
            payload={"requestedSpace": {"kind": "shared", "participant_principals": []}},
        ),
        step="intent.bad-commons",
        confirm_space_id="commons",
    )

    # --- provision a home space, capture its observatory url ---
    alice = HttpSpaceToolSession(
        endpoint=commons_url, workspace=root / "agent-alice", agent_name="agent-alice"
    )
    alice.signup(commons_url)
    alice.connect()
    alice.confirm_current_space()
    request = alice.post_and_confirm(
        alice.intent(
            "Please provision one home space for me.",
            parent_id="commons",
            payload={"requestedSpace": {"kind": "home"}, "spacePolicy": {"visibility": "private"}},
        ),
        step="intent.provision-home-space",
        confirm_space_id="commons",
    )
    request_space = request["intentId"]
    promise = alice.wait_for_promise(request_space, wait_seconds=15.0)
    alice.post_and_confirm(
        alice.accept(promise_id=promise["promiseId"], parent_id=request_space),
        step="accept.provision-home-space",
        confirm_space_id=request_space,
    )
    complete = alice.wait_for_complete(
        request_space, promise_id=promise["promiseId"], wait_seconds=20.0
    )
    claim_url = complete["payload"]["claim_url"]
    home_space_id = complete["payload"]["home_space_id"]

    home_signup = alice.signup(claim_url)
    alice.connect()
    home_observatory = home_signup.get("observatory_url") if isinstance(home_signup, dict) else None

    # --- fire one bad home-space intent so the DECLINE shows up in the observatory ---
    alice.post_and_confirm(
        alice.intent(
            "Trigger a DECLINE: missing requestedSpace block.",
            parent_id=home_space_id,
            payload={"content": "not a structured steward op"},
        ),
        step="intent.bad-home-missing",
        confirm_space_id=home_space_id,
    )
    alice.post_and_confirm(
        alice.intent(
            "Trigger a DECLINE: wrong kind.",
            parent_id=home_space_id,
            payload={"requestedSpace": {"kind": "home"}},
        ),
        step="intent.bad-home-kind",
        confirm_space_id=home_space_id,
    )

    summary = {
        "base": base,
        "workspace": str(root),
        "home_space_id": home_space_id,
        "commons_observatory_url": commons_observatory,
        "home_observatory_url": home_observatory,
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
