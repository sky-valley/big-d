#!/usr/bin/env python3
"""
P1 regression probe: verify stewards emit an explicit DECLINE on unsupported
operations instead of timing out silently.

Flow
----
1. Sign up via commons as a fresh agent.
2. Provision + claim a home space.
3. Post a deliberately broken shared-space INTENT (requestedSpace.kind="home"
   into the home space).
4. Expect a DECLINE in that intent subspace within ~1 second, carrying a
   `reason` and `supportedOperations` hint.
5. Also try a commons-side broken INTENT (requestedSpace.kind="shared" into
   commons) and expect a DECLINE there too.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List


def load_sdk() -> None:
    candidates = []
    if "INTENT_SPACE_SDK_PATH" in os.environ:
        candidates.append(Path(os.environ["INTENT_SPACE_SDK_PATH"]))
    candidates.extend([
        Path.home() / ".claude" / "skills" / "intent-space-agent-pack" / "sdk",
        Path.home() / ".codex" / "skills" / "intent-space-agent-pack" / "sdk",
    ])
    for candidate in candidates:
        if candidate.exists():
            sys.path.insert(0, str(candidate))
            return
    raise RuntimeError("Could not locate the intent-space-agent-pack sdk directory.")


load_sdk()

from http_space_tools import HttpSpaceToolSession  # type: ignore  # noqa: E402


JsonDict = Dict[str, Any]


def wait_for_decline(
    session: HttpSpaceToolSession,
    intent_space: str,
    intent_id: str,
    timeout_seconds: float = 2.0,
) -> JsonDict:
    deadline = time.monotonic() + timeout_seconds
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            scan = session.scan_full(intent_space)
        except Exception as exc:  # pragma: no cover — log and retry
            last_error = exc
            time.sleep(0.1)
            continue
        for message in scan.get("messages", []):
            if message.get("type") == "DECLINE" and message.get("intentId") == intent_id:
                return message
        time.sleep(0.1)
    raise RuntimeError(
        f"No DECLINE arrived for intent {intent_id} within {timeout_seconds}s. "
        f"Last error: {last_error!r}"
    )


def provision_home(root: Path, commons_url: str, name: str) -> JsonDict:
    session = HttpSpaceToolSession(endpoint=commons_url, workspace=root / name, agent_name=name)
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
    complete = session.wait_for_complete(
        request_space, promise_id=promise["promiseId"], wait_seconds=20.0
    )
    claim_url = complete["payload"]["claim_url"]
    home_space_id = complete["payload"]["home_space_id"]
    session.signup(claim_url)
    session.connect()
    identity = session.identity_info()
    return {
        "session": session,
        "home_space_id": home_space_id,
        "principal_id": identity["principalId"],
    }


def main() -> int:
    base = os.environ.get("SPACEBASE1_BASE_URL", "http://127.0.0.1:8787").rstrip("/")
    commons_url = f"{base}/commons"
    root = Path(tempfile.mkdtemp(prefix="spacebase1-decline-smoke-"))

    results: List[JsonDict] = []

    # Case 1: commons steward rejects requestedSpace.kind="shared" as unsupported.
    # We build a second session here because we haven't bound home yet and want
    # to post an unsupported intent before the valid home-provisioning one.
    commons_actor = HttpSpaceToolSession(
        endpoint=commons_url, workspace=root / "agent-probe", agent_name="agent-probe"
    )
    commons_actor.signup(commons_url)
    commons_actor.connect()
    commons_actor.confirm_current_space()

    bad_commons_intent = commons_actor.post_and_confirm(
        commons_actor.intent(
            "Please provision one shared space (should be declined here).",
            parent_id="commons",
            payload={
                "requestedSpace": {"kind": "shared", "participant_principals": []},
            },
        ),
        step="intent.bad-commons",
        confirm_space_id="commons",
    )
    t0 = time.monotonic()
    commons_decline = wait_for_decline(
        commons_actor, bad_commons_intent["intentId"], bad_commons_intent["intentId"]
    )
    results.append({
        "case": "commons_unsupported_kind",
        "latency_ms": round((time.monotonic() - t0) * 1000),
        "reason": commons_decline["payload"].get("reason"),
        "supportedOperations": commons_decline["payload"].get("supportedOperations"),
    })

    # Case 2: home-space steward rejects a missing requestedSpace block.
    alice = provision_home(root, commons_url, "agent-alice")
    bad_home_intent = alice["session"].post_and_confirm(
        alice["session"].intent(
            "Please do something unspecified in my home space.",
            parent_id=alice["home_space_id"],
            payload={"content": "nothing structured"},
        ),
        step="intent.bad-home-missing",
        confirm_space_id=alice["home_space_id"],
    )
    t0 = time.monotonic()
    home_decline_missing = wait_for_decline(
        alice["session"],
        bad_home_intent["intentId"],
        bad_home_intent["intentId"],
    )
    results.append({
        "case": "home_missing_requestedSpace",
        "latency_ms": round((time.monotonic() - t0) * 1000),
        "reason": home_decline_missing["payload"].get("reason"),
        "supportedOperations": home_decline_missing["payload"].get("supportedOperations"),
    })

    # Case 3: home-space steward rejects requestedSpace.kind="home" as unsupported.
    bad_home_intent2 = alice["session"].post_and_confirm(
        alice["session"].intent(
            "Please provision another home from my home space (wrong door).",
            parent_id=alice["home_space_id"],
            payload={"requestedSpace": {"kind": "home"}},
        ),
        step="intent.bad-home-kind",
        confirm_space_id=alice["home_space_id"],
    )
    t0 = time.monotonic()
    home_decline_wrongkind = wait_for_decline(
        alice["session"],
        bad_home_intent2["intentId"],
        bad_home_intent2["intentId"],
    )
    results.append({
        "case": "home_wrong_kind",
        "latency_ms": round((time.monotonic() - t0) * 1000),
        "reason": home_decline_wrongkind["payload"].get("reason"),
        "supportedOperations": home_decline_wrongkind["payload"].get("supportedOperations"),
    })

    # Happy path sanity: a correctly shaped shared-space intent still gets a PROMISE.
    # (No participants → validator DECLINE, which is still a DECLINE, not silence.)
    bad_home_intent3 = alice["session"].post_and_confirm(
        alice["session"].intent(
            "Shared space with myself as sole participant.",
            parent_id=alice["home_space_id"],
            payload={
                "requestedSpace": {
                    "kind": "shared",
                    "participant_principals": [alice["principal_id"]],
                },
            },
        ),
        step="intent.home-shared-self-only",
        confirm_space_id=alice["home_space_id"],
    )
    # requester_not_included is not triggered because the requester IS included,
    # but we only have one principal — so this exercises the happy path.
    promise = alice["session"].wait_for_promise(bad_home_intent3["intentId"], wait_seconds=3.0)
    results.append({
        "case": "home_valid_shared_gets_promise",
        "promise_id": promise.get("promiseId"),
    })

    print(json.dumps({
        "workspace": str(root),
        "base": base,
        "results": results,
    }, indent=2, sort_keys=True))

    max_decline_latency = max(
        r.get("latency_ms", 0) for r in results if "latency_ms" in r
    )
    if max_decline_latency > 1000:
        print(
            f"WARNING: max DECLINE latency was {max_decline_latency}ms (spec: <=1000ms)",
            file=sys.stderr,
        )
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
