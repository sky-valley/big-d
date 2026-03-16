#!/usr/bin/env python3
"""
Intent Space SDK

Thin wire-mechanics SDK for agents participating in intent space.

This module helps with:
- TCP connection management
- compact NDJSON send/receive
- SCAN requests and cursor persistence
- ITP atom construction
- local key generation and challenge signing
- transcript persistence

It does not implement registration or the dojo sequence.
That reasoning is intentionally left to the agent.
"""

from __future__ import annotations

import base64
import hashlib
import json
import socket
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlparse

JsonDict = Dict[str, Any]


def compact_json(payload: JsonDict) -> str:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=True)


def now_ms() -> int:
    return int(time.time() * 1000)


def make_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4()}"


def parse_tcp_endpoint(endpoint: str) -> tuple[str, int]:
    parsed = urlparse(endpoint)
    if parsed.scheme != "tcp":
        raise ValueError("intent_space_sdk.py currently supports tcp://host:port endpoints only")
    if not parsed.hostname or not parsed.port:
        raise ValueError("Endpoint must include host and port, e.g. tcp://127.0.0.1:4000")
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

    def append_transcript(self, direction: str, message: JsonDict) -> None:
        with self.transcript.open("a", encoding="utf-8") as handle:
            handle.write(compact_json({"direction": direction, "message": message}) + "\n")

    def save_json_artifact(self, filename: str, payload: JsonDict) -> None:
        (self.state_dir / filename).write_text(json.dumps(payload, indent=2) + "\n")

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


class StationClient:
    def __init__(self, endpoint: str, local_state: LocalState) -> None:
        host, port = parse_tcp_endpoint(endpoint)
        self.endpoint = endpoint
        self.host = host
        self.port = port
        self.local_state = local_state
        self.sock: Optional[socket.socket] = None
        self.buffer = b""
        self.cursors = local_state.load_cursors()

    def connect(self) -> None:
        self.sock = socket.create_connection((self.host, self.port), timeout=5)
        self.sock.settimeout(0.5)

    def close(self) -> None:
        if self.sock is not None:
            self.sock.close()
            self.sock = None

    def send(self, message: JsonDict) -> None:
        if self.sock is None:
            raise RuntimeError("client is not connected")
        self.sock.sendall((compact_json(message) + "\n").encode("utf-8"))
        self.local_state.append_transcript("out", message)

    def read_available(self, total_timeout: float = 0.5) -> List[JsonDict]:
        if self.sock is None:
            raise RuntimeError("client is not connected")

        deadline = time.time() + total_timeout
        messages: List[JsonDict] = []
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

    def scan(self, space_id: str) -> JsonDict:
        since = self.cursors.get(space_id, 0)
        self.send({"type": "SCAN", "spaceId": space_id, "since": since})
        deadline = time.time() + 4.0
        while time.time() < deadline:
            for message in self.read_available(0.8):
                if message.get("type") == "SCAN_RESULT" and message.get("spaceId") == space_id:
                    return message
        raise TimeoutError(f"timed out waiting for SCAN_RESULT for {space_id}")

    def wait_for(
        self,
        predicate: Callable[[JsonDict], bool],
        timeout: float = 10.0,
    ) -> JsonDict:
        deadline = time.time() + timeout
        while time.time() < deadline:
            for message in self.read_available(0.8):
                if predicate(message):
                    return message
        raise TimeoutError("timed out waiting for matching message")


def intent(
    sender_id: str,
    content: str,
    *,
    intent_id: Optional[str] = None,
    parent_id: str = "root",
    payload: Optional[JsonDict] = None,
) -> JsonDict:
    body = {"content": content, **(payload or {})}
    return {
        "type": "INTENT",
        "intentId": intent_id or make_id("intent"),
        "parentId": parent_id,
        "senderId": sender_id,
        "timestamp": now_ms(),
        "payload": body,
    }


def accept(sender_id: str, promise_id: str, *, parent_id: str) -> JsonDict:
    return {
        "type": "ACCEPT",
        "parentId": parent_id,
        "senderId": sender_id,
        "timestamp": now_ms(),
        "promiseId": promise_id,
        "payload": {},
    }


def assess(sender_id: str, promise_id: str, assessment_value: str, *, parent_id: str) -> JsonDict:
    return {
        "type": "ASSESS",
        "parentId": parent_id,
        "senderId": sender_id,
        "timestamp": now_ms(),
        "promiseId": promise_id,
        "payload": {
            "assessment": assessment_value,
        },
    }
