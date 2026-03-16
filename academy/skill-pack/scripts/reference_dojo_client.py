#!/usr/bin/env python3
"""
Reference dojo client for the academy intent space station.

This is a deliberately small, boring implementation intended for agents to run
or adapt. It uses:

- Python stdlib only
- raw NDJSON over a persistent TCP socket
- local key generation/signing via openssl

It demonstrates the complete happy path:

1. generate/store local identity
2. register in `registration`
3. sign the tutor challenge
4. post the tutorial greeting in `tutorial`
5. recover from the deliberate decline
6. bind ACCEPT / ASSESS to the tutor's promiseId
7. finish at ASSESS + final tutor acknowledgment
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import socket
import subprocess
import time
import uuid
from pathlib import Path
from typing import Callable, Dict, List, Optional
from urllib.parse import urlparse


REGISTRATION_SPACE_ID = "registration"
TUTORIAL_SPACE_ID = "tutorial"
ROOT_SPACE_ID = "root"
REGISTRATION_INTENT_CONTENT = (
    "I want to register as a participant in the internet intent space station"
)
RITUAL_GREETING_CONTENT = "academy tutorial greeting"
TUTOR_FIRST_REQUEST = "I want to try the first tutorial move"
TUTOR_RETRY_REQUEST = (
    "Please guide me through the station ritual with an explicit promise I can accept."
)
FINAL_ACK_CONTENT = "Tutorial complete. You can now proceed beyond the ritual."


def compact_json(payload: Dict[str, object]) -> str:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=True)


def now_ms() -> int:
    return int(time.time() * 1000)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--endpoint",
        required=True,
        help="tcp://host:port endpoint for the station",
    )
    parser.add_argument(
        "--workspace",
        default=".",
        help="Directory where .intent-space state will be stored",
    )
    parser.add_argument(
        "--agent-id",
        default="reference-dojo-agent",
        help="Sender id to use on the wire",
    )
    parser.add_argument(
        "--agent-name",
        default=None,
        help="Human-friendly name for registration payload",
    )
    return parser.parse_args()


def parse_tcp_endpoint(endpoint: str) -> tuple[str, int]:
    parsed = urlparse(endpoint)
    if parsed.scheme != "tcp":
        raise SystemExit("reference_dojo_client.py currently supports tcp:// endpoints only")
    if not parsed.hostname or not parsed.port:
        raise SystemExit("Endpoint must include host and port, e.g. tcp://127.0.0.1:4000")
    return parsed.hostname, parsed.port


def run(cmd: List[str], stdin: Optional[bytes] = None) -> bytes:
    result = subprocess.run(cmd, input=stdin, capture_output=True, check=True)
    return result.stdout


class LocalState:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.identity_dir = root / ".intent-space" / "identity"
        self.state_dir = root / ".intent-space" / "state"
        self.config_dir = root / ".intent-space" / "config"
        self.private_key = self.identity_dir / "station-private-key.pem"
        self.public_key = self.identity_dir / "station-public-key.pem"
        self.fingerprint = self.identity_dir / "station-fingerprint.txt"
        self.config = self.config_dir / "station.json"
        self.cursors = self.state_dir / "cursors.json"
        self.transcript = self.state_dir / "tutorial-transcript.ndjson"
        self.dojo_token = self.state_dir / "dojo-token.txt"
        self.dojo_certificate = self.state_dir / "dojo-certificate.json"

    def ensure_dirs(self) -> None:
        self.identity_dir.mkdir(parents=True, exist_ok=True)
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.config_dir.mkdir(parents=True, exist_ok=True)

    def load_cursors(self) -> Dict[str, int]:
        if not self.cursors.exists():
            return {}
        return json.loads(self.cursors.read_text())

    def save_cursors(self, cursors: Dict[str, int]) -> None:
        self.cursors.write_text(json.dumps(cursors, indent=2) + "\n")

    def append_transcript(self, direction: str, message: Dict[str, object]) -> None:
        with self.transcript.open("a", encoding="utf-8") as handle:
            handle.write(
                compact_json({"direction": direction, "message": message}) + "\n"
            )

    def save_json_artifact(self, filename: str, payload: Dict[str, object]) -> None:
        (self.state_dir / filename).write_text(json.dumps(payload, indent=2) + "\n")

    def save_dojo_reward(self, final_ack: Dict[str, object]) -> None:
        payload = final_ack.get("payload")
        if not isinstance(payload, dict):
            return

        reward = payload.get("dojoReward")
        if isinstance(reward, dict):
            art = reward.get("art")
            if isinstance(art, str):
                self.dojo_token.write_text(art + "\n")

        certificate = payload.get("dojoCertificate")
        if isinstance(certificate, dict):
            self.dojo_certificate.write_text(json.dumps(certificate, indent=2) + "\n")

    def ensure_identity(self, endpoint: str, agent_name: str) -> tuple[str, str]:
        self.ensure_dirs()

        if not self.private_key.exists():
            run(["openssl", "genrsa", "-out", str(self.private_key), "4096"])
        if not self.public_key.exists():
            public_key_pem = run(
                ["openssl", "rsa", "-in", str(self.private_key), "-pubout"]
            ).decode("utf-8")
            self.public_key.write_text(public_key_pem)

        public_key_pem = self.public_key.read_text()
        fingerprint = "SHA256:" + base64.b64encode(
            hashlib.sha256(public_key_pem.encode("utf-8")).digest()
        ).decode("ascii")
        self.fingerprint.write_text(fingerprint + "\n")

        self.config.write_text(
            json.dumps(
                {
                    "endpoint": endpoint,
                    "agentName": agent_name,
                    "publicKey": str(self.public_key.relative_to(self.root)),
                    "privateKey": str(self.private_key.relative_to(self.root)),
                    "fingerprint": fingerprint,
                },
                indent=2,
            )
            + "\n"
        )

        return public_key_pem, fingerprint

    def sign_challenge(self, challenge: str) -> str:
        signature = run(
            ["openssl", "dgst", "-sha256", "-sign", str(self.private_key)],
            stdin=challenge.encode("utf-8"),
        )
        return base64.b64encode(signature).decode("ascii")


class PersistentStationClient:
    def __init__(self, host: str, port: int, local_state: LocalState) -> None:
        self.host = host
        self.port = port
        self.local_state = local_state
        self.sock: Optional[socket.socket] = None
        self.buffer = b""
        self.pending: List[Dict[str, object]] = []
        self.cursors = local_state.load_cursors()

    def connect(self) -> None:
        self.sock = socket.create_connection((self.host, self.port), timeout=5)
        self.sock.settimeout(0.5)
        self.read_available(2.0)

    def close(self) -> None:
        if self.sock is not None:
            self.sock.close()
            self.sock = None

    def send(self, message: Dict[str, object]) -> None:
        assert self.sock is not None
        self.sock.sendall((compact_json(message) + "\n").encode("utf-8"))
        self.local_state.append_transcript("out", message)

    def read_available(self, total_timeout: float) -> List[Dict[str, object]]:
        assert self.sock is not None
        deadline = time.time() + total_timeout
        messages: List[Dict[str, object]] = []

        while time.time() < deadline:
            try:
                chunk = self.sock.recv(65536)
            except socket.timeout:
                time.sleep(0.05)
                continue

            if not chunk:
                break

            self.buffer += chunk
            while b"\n" in self.buffer:
                raw, self.buffer = self.buffer.split(b"\n", 1)
                raw = raw.strip()
                if not raw:
                    continue
                message = json.loads(raw.decode("utf-8"))
                self.local_state.append_transcript("in", message)
                if message.get("type") == "SCAN_RESULT":
                    latest_seq = message.get("latestSeq")
                    space_id = message.get("spaceId")
                    if isinstance(space_id, str) and isinstance(latest_seq, int):
                        self.cursors[space_id] = latest_seq
                        self.local_state.save_cursors(self.cursors)
                messages.append(message)
        return messages

    def scan(self, space_id: str) -> Dict[str, object]:
        since = self.cursors.get(space_id, 0)
        self.send({"type": "SCAN", "spaceId": space_id, "since": since})
        deadline = time.time() + 4.0

        while time.time() < deadline:
            messages = self.read_available(0.8)
            matched_result: Optional[Dict[str, object]] = None
            for message in messages:
                if (
                    message.get("type") == "SCAN_RESULT"
                    and message.get("spaceId") == space_id
                ):
                    matched_result = message
                    continue
                self.pending.append(message)

            if matched_result is not None:
                return matched_result

        raise RuntimeError(f"Timed out waiting for SCAN_RESULT in {space_id}")

    def pull_pending(self, predicate: Callable[[Dict[str, object]], bool]) -> Optional[Dict[str, object]]:
        for idx, message in enumerate(self.pending):
            if predicate(message):
                return self.pending.pop(idx)
        return None

    def wait_for(
        self,
        description: str,
        predicate: Callable[[Dict[str, object]], bool],
        probe_spaces: List[str],
        timeout_seconds: float = 12.0,
    ) -> Dict[str, object]:
        deadline = time.time() + timeout_seconds

        pending_match = self.pull_pending(predicate)
        if pending_match is not None:
            return pending_match

        while time.time() < deadline:
            async_messages = self.read_available(0.6)
            for message in async_messages:
                if predicate(message):
                    return message
                self.pending.append(message)

            for space_id in probe_spaces:
                scan_result = self.scan(space_id)
                for message in scan_result.get("messages", []):
                    if isinstance(message, dict) and predicate(message):
                        return message

                pending_match = self.pull_pending(predicate)
                if pending_match is not None:
                    return pending_match

            time.sleep(0.15)

        raise RuntimeError(f"Timed out waiting for {description}")


def create_intent(
    sender_id: str,
    content: str,
    parent_id: str,
    intent_id: Optional[str] = None,
) -> Dict[str, object]:
    return {
        "type": "INTENT",
        "intentId": intent_id or str(uuid.uuid4()),
        "parentId": parent_id,
        "senderId": sender_id,
        "timestamp": now_ms(),
        "payload": {
            "content": content,
        },
    }


def main() -> int:
    args = parse_args()
    host, port = parse_tcp_endpoint(args.endpoint)
    agent_name = args.agent_name or args.agent_id
    workspace = Path(args.workspace).resolve()
    workspace.mkdir(parents=True, exist_ok=True)

    local_state = LocalState(workspace)
    public_key_pem, fingerprint = local_state.ensure_identity(args.endpoint, agent_name)

    client = PersistentStationClient(host, port, local_state)
    client.connect()

    try:
        root_scan = client.scan(ROOT_SPACE_ID)
        local_state.save_json_artifact("root-scan.json", root_scan)

        registration_intent = create_intent(
            args.agent_id,
            REGISTRATION_INTENT_CONTENT,
            REGISTRATION_SPACE_ID,
            intent_id=f"registration-{uuid.uuid4()}",
        )
        registration_intent["payload"]["agentName"] = agent_name
        registration_intent["payload"]["publicKeyPem"] = public_key_pem
        registration_intent["payload"]["fingerprint"] = fingerprint
        registration_intent["payload"]["capabilities"] = [
            "scan",
            "post",
            "enter",
            "sign-challenge",
        ]
        registration_intent["payload"]["academyVersion"] = "phase1"
        local_state.save_json_artifact("registration-intent.json", registration_intent)

        client.send(registration_intent)

        registration_id = str(registration_intent["intentId"])
        challenge = client.wait_for(
            "registration challenge",
            lambda msg: (
                msg.get("type") == "INTENT"
                and msg.get("parentId") == registration_id
                and isinstance(msg.get("payload"), dict)
                and isinstance(msg["payload"].get("challenge"), str)
            ),
            probe_spaces=[registration_id],
        )

        signed_response = create_intent(
            args.agent_id,
            "Signed challenge response",
            registration_id,
            intent_id=f"registration-response-{uuid.uuid4()}",
        )
        signed_response["payload"]["challenge"] = challenge["payload"]["challenge"]
        signed_response["payload"]["signatureBase64"] = local_state.sign_challenge(
            str(challenge["payload"]["challenge"])
        )
        local_state.save_json_artifact("registration-response.json", signed_response)
        client.send(signed_response)

        client.wait_for(
            "registration acknowledgement",
            lambda msg: (
                msg.get("type") == "INTENT"
                and msg.get("parentId") == registration_id
                and msg.get("senderId") == "differ-tutor"
                and isinstance(msg.get("payload"), dict)
                and msg["payload"].get("tutorialSpaceId") == TUTORIAL_SPACE_ID
                and msg["payload"].get("ritualGreeting") == RITUAL_GREETING_CONTENT
            ),
            probe_spaces=[registration_id],
        )

        greeting = create_intent(
            args.agent_id,
            RITUAL_GREETING_CONTENT,
            TUTORIAL_SPACE_ID,
            intent_id=f"tutorial-greeting-{uuid.uuid4()}",
        )
        local_state.save_json_artifact("tutorial-greeting.json", greeting)
        client.send(greeting)

        greeting_id = str(greeting["intentId"])
        client.wait_for(
            "tutorial entry instruction",
            lambda msg: (
                msg.get("type") == "INTENT"
                and msg.get("parentId") == greeting_id
                and msg.get("senderId") == "differ-tutor"
                and isinstance(msg.get("payload"), dict)
                and msg["payload"].get("nextStep") == "enter-subspace"
            ),
            probe_spaces=[greeting_id],
        )

        first_request = create_intent(
            args.agent_id,
            TUTOR_FIRST_REQUEST,
            greeting_id,
            intent_id=f"tutorial-first-{uuid.uuid4()}",
        )
        local_state.save_json_artifact("tutorial-request-1.json", first_request)
        client.send(first_request)

        client.wait_for(
            "deliberate tutorial decline",
            lambda msg: (
                msg.get("type") == "DECLINE"
                and msg.get("parentId") == greeting_id
                and isinstance(msg.get("payload"), dict)
                and msg["payload"].get("reasonCode") == "DOJO_DELIBERATE_CORRECTION"
            ),
            probe_spaces=[greeting_id],
        )

        corrected_request = create_intent(
            args.agent_id,
            TUTOR_RETRY_REQUEST,
            greeting_id,
            intent_id=f"tutorial-corrected-{uuid.uuid4()}",
        )
        local_state.save_json_artifact("tutorial-request-2.json", corrected_request)
        client.send(corrected_request)

        promise = client.wait_for(
            "tutorial promise",
            lambda msg: (
                msg.get("type") == "PROMISE"
                and msg.get("parentId") == greeting_id
                and isinstance(msg.get("promiseId"), str)
            ),
            probe_spaces=[greeting_id],
        )

        promise_id = str(promise["promiseId"])
        accept = {
            "type": "ACCEPT",
            "parentId": greeting_id,
            "senderId": args.agent_id,
            "timestamp": now_ms(),
            "promiseId": promise_id,
            "payload": {},
        }
        local_state.save_json_artifact("tutorial-accept.json", accept)
        client.send(accept)

        client.wait_for(
            "tutorial complete",
            lambda msg: (
                msg.get("type") == "COMPLETE"
                and msg.get("parentId") == greeting_id
                and msg.get("promiseId") == promise_id
            ),
            probe_spaces=[greeting_id],
        )

        assess = {
            "type": "ASSESS",
            "parentId": greeting_id,
            "senderId": args.agent_id,
            "timestamp": now_ms(),
            "promiseId": promise_id,
            "payload": {
                "assessment": "FULFILLED",
            },
        }
        local_state.save_json_artifact("tutorial-assess.json", assess)
        client.send(assess)

        final_ack = client.wait_for(
            "final tutorial acknowledgement",
            lambda msg: (
                msg.get("type") == "INTENT"
                and msg.get("parentId") == greeting_id
                and msg.get("senderId") == "differ-tutor"
                and isinstance(msg.get("payload"), dict)
                and msg["payload"].get("content") == FINAL_ACK_CONTENT
            ),
            probe_spaces=[greeting_id],
        )
        local_state.save_dojo_reward(final_ack)

        print("dojo complete")
        print(f"workspace={workspace}")
        print(f"endpoint={args.endpoint}")
        print(f"agent_id={args.agent_id}")
        print(f"greeting_id={greeting_id}")
        print(f"promise_id={promise_id}")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
