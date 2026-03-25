#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
PACK_SDK_DIR = REPO_ROOT / "agent-pack" / "sdk"
if str(PACK_SDK_DIR) not in sys.path:
    sys.path.insert(0, str(PACK_SDK_DIR))

from promise_runtime import PromiseRuntimeSession  # noqa: E402


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--agent-id", default="eval-operator")
    parser.add_argument("--content", required=True)
    parser.add_argument("--parent-id", default="headwaters-commons")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    workspace = Path(args.workspace)
    session = PromiseRuntimeSession(
        endpoint=f"tcp://{args.host}:{args.port}",
        workspace=workspace,
        agent_name=args.agent_id,
        agent_id=args.agent_id,
    )
    try:
        session.signup(args.base_url, handle=args.agent_id)
        session.connect()
        session.post(
            session.intent(
                args.content,
                parent_id=args.parent_id,
                payload={"content": args.content, "source": "eval-operator"},
            ),
            step="eval_operator.inject_intent",
            artifact_filename="injected-intent.json",
        )
        session.save_json_artifact("operator-finish.json", session.snapshot())
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
