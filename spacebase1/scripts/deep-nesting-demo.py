#!/usr/bin/env python3
"""
Build a 3-level deep INTENT thread inside a fresh home space so we can
visually verify the Observatory's expand/drill behavior at depth.

Tree shape (in alice's home space):

  home
  └── INTENT A   (top-level, malformed shared-space request -> DECLINE)
      ├── DECLINE (steward)
      └── INTENT B   (alice posts a sub-intent inside A's subspace)
          └── INTENT C   (alice posts a sub-sub-intent inside B's subspace)
              └── INTENT D   (alice posts one more level down)

scanRecursive(maxDepth=3) collects interiors for A, B, C — D is at the
boundary. Without the catch-all in buildSnapshot, C's row would say
"Waiting for steward response..." even though D is right there.
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
    root = Path(tempfile.mkdtemp(prefix="spacebase1-deep-"))

    alice = HttpSpaceToolSession(
        endpoint=commons_url, workspace=root / "agent-alice", agent_name="agent-alice"
    )
    alice.signup(commons_url)
    alice.connect()
    alice.confirm_current_space()

    request = alice.post_and_confirm(
        alice.intent(
            "Provision one home space for alice.",
            parent_id="commons",
            payload={"requestedSpace": {"kind": "home"}},
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

    # A: top-level intent that gets a real steward DECLINE.
    a = alice.post_and_confirm(
        alice.intent(
            "Top-level: malformed shared-space request (will be declined).",
            parent_id=home_space_id,
            payload={"requestedSpace": {"kind": "home"}},
        ),
        step="intent.A",
        confirm_space_id=home_space_id,
    )

    # B: posted inside A's subspace. No steward listens here — it's just a sub-intent.
    b = alice.post_and_confirm(
        alice.intent(
            "Sub-intent B inside A's subspace.",
            parent_id=a["intentId"],
            payload={"depth": 2, "note": "no steward responds at this depth"},
        ),
        step="intent.B",
        confirm_space_id=a["intentId"],
    )

    # C: posted inside B's subspace.
    c = alice.post_and_confirm(
        alice.intent(
            "Sub-sub-intent C inside B's subspace.",
            parent_id=b["intentId"],
            payload={"depth": 3},
        ),
        step="intent.C",
        confirm_space_id=b["intentId"],
    )

    # D: posted inside C's subspace. Below scanRecursive(maxDepth=3); only
    # discoverable by drilling into C and re-polling, but it lives in the log.
    d = alice.post_and_confirm(
        alice.intent(
            "Sub-sub-sub-intent D inside C's subspace.",
            parent_id=c["intentId"],
            payload={"depth": 4},
        ),
        step="intent.D",
        confirm_space_id=c["intentId"],
    )

    print(json.dumps({
        "home_space_id": home_space_id,
        "home_observatory_url": home_signup.get("observatory_url") if isinstance(home_signup, dict) else None,
        "tree": {
            "A_intentId": a["intentId"],
            "B_intentId": b["intentId"],
            "C_intentId": c["intentId"],
            "D_intentId": d["intentId"],
        },
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
