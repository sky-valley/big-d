#!/usr/bin/env python3
"""
Promise Runtime

Importable Python runtime for agents participating in intent space.

Design principles:
- explicit state transitions
- visible local state
- narrow verbs with obvious input/output
- local control of sequencing
- no hidden orchestration

This stays close to the wire on purpose:
- one in-process session
- direct access to scans and async inbox
- exact ITP atom construction
- local identity, cursor, transcript, and step persistence

It does not implement the dojo or any other workflow.
That reasoning stays with the agent.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence

from intent_space_sdk import (
    LocalState,
    StationClient,
    compact_json,
    now_ms,
    signup_station,
)

JsonDict = Dict[str, Any]


def make_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4()}"


def _merge_payload(content: Optional[str], payload: Optional[JsonDict]) -> JsonDict:
    merged = dict(payload or {})
    if content is not None:
        merged.setdefault("content", content)
    return merged


def create_intent(
    sender_id: str,
    content: str,
    *,
    parent_id: str = "root",
    payload: Optional[JsonDict] = None,
    intent_id: Optional[str] = None,
) -> JsonDict:
    return {
        "type": "INTENT",
        "intentId": intent_id or make_id("intent"),
        "parentId": parent_id,
        "senderId": sender_id,
        "timestamp": now_ms(),
        "payload": _merge_payload(content, payload),
    }


def create_promise(
    sender_id: str,
    *,
    parent_id: str,
    intent_id: str,
    content: str,
    payload: Optional[JsonDict] = None,
    promise_id: Optional[str] = None,
) -> JsonDict:
    return {
        "type": "PROMISE",
        "promiseId": promise_id or make_id("promise"),
        "intentId": intent_id,
        "parentId": parent_id,
        "senderId": sender_id,
        "timestamp": now_ms(),
        "payload": _merge_payload(content, payload),
    }


def create_decline(
    sender_id: str,
    *,
    intent_id: str,
    parent_id: str,
    reason: str,
    payload: Optional[JsonDict] = None,
) -> JsonDict:
    return {
        "type": "DECLINE",
        "intentId": intent_id,
        "parentId": parent_id,
        "senderId": sender_id,
        "timestamp": now_ms(),
        "payload": _merge_payload(None, {"reason": reason, **(payload or {})}),
    }


def create_accept(sender_id: str, *, promise_id: str, parent_id: str) -> JsonDict:
    return {
        "type": "ACCEPT",
        "promiseId": promise_id,
        "parentId": parent_id,
        "senderId": sender_id,
        "timestamp": now_ms(),
        "payload": {},
    }


def create_complete(
    sender_id: str,
    *,
    promise_id: str,
    parent_id: str,
    summary: str,
    payload: Optional[JsonDict] = None,
) -> JsonDict:
    return {
        "type": "COMPLETE",
        "promiseId": promise_id,
        "parentId": parent_id,
        "senderId": sender_id,
        "timestamp": now_ms(),
        "payload": _merge_payload(summary, {"summary": summary, **(payload or {})}),
    }


def create_assess(
    sender_id: str,
    *,
    promise_id: str,
    parent_id: str,
    assessment: str,
    payload: Optional[JsonDict] = None,
) -> JsonDict:
    return {
        "type": "ASSESS",
        "promiseId": promise_id,
        "parentId": parent_id,
        "senderId": sender_id,
        "timestamp": now_ms(),
        "payload": {"assessment": assessment, **(payload or {})},
    }


def find_first(messages: List[JsonDict], predicate: Callable[[JsonDict], bool]) -> Optional[JsonDict]:
    for message in messages:
        if predicate(message):
            return message
    return None


@dataclass
class PromiseRuntimeSession:
    endpoint: str
    workspace: Path
    agent_name: str
    agent_id: Optional[str] = None

    def __post_init__(self) -> None:
        self.agent_id = self.agent_id or self.agent_name
        self.local_state = LocalState(self.workspace)
        self.client = StationClient(self.endpoint, self.local_state)
        self.step_log = self.local_state.state_dir / "runtime-steps.ndjson"

    def ensure_identity(self) -> tuple[str, str]:
        return self.local_state.ensure_identity(self.endpoint, self.agent_name)

    def connect(self) -> None:
        self.client.connect()
        enrollment = self.local_state.load_enrollment()
        if isinstance(enrollment, dict):
            station_token = enrollment.get("station_token")
            audience = enrollment.get("station_audience")
            handle = enrollment.get("handle", self.agent_id)
            if isinstance(station_token, str) and isinstance(audience, str):
                self.local_state.remember_station(
                    endpoint=self.endpoint,
                    audience=audience,
                    station_token=station_token,
                    handle=str(handle),
                    source="connect",
                    space_id=enrollment.get("commons_space_id") if isinstance(enrollment.get("commons_space_id"), str) else None,
                )
                self.client.authenticate(
                    sender_id=str(handle),
                    station_token=station_token,
                    audience=audience,
                    local_state=self.local_state,
                )

    def connect_to(
        self,
        *,
        endpoint: str,
        station_token: str,
        audience: str,
        sender_id: Optional[str] = None,
    ) -> None:
        self.close()
        self.endpoint = endpoint
        self.local_state.remember_station(
            endpoint=endpoint,
            audience=audience,
            station_token=station_token,
            handle=sender_id or self.agent_id,
            source="connect_to",
        )
        self.client = StationClient(self.endpoint, self.local_state)
        self.client.connect()
        self.client.authenticate(
            sender_id=sender_id or self.agent_id,
            station_token=station_token,
            audience=audience,
            local_state=self.local_state,
        )
        self.record_step(
            "session.connect_to",
            {
                "endpoint": endpoint,
                "audience": audience,
                "senderId": sender_id or self.agent_id,
            },
        )

    def close(self) -> None:
        self.client.close()

    def send(self, message: JsonDict) -> None:
        self.client.post(message)

    def post(
        self,
        message: JsonDict,
        *,
        step: Optional[str] = None,
        artifact_filename: Optional[str] = None,
    ) -> JsonDict:
        if step is not None:
            self.record_step(
                step,
                {
                    "messageType": message.get("type"),
                    "parentId": message.get("parentId"),
                    "intentId": message.get("intentId"),
                    "promiseId": message.get("promiseId"),
                },
            )
        self.send(message)
        if artifact_filename is not None:
            self.save_json_artifact(artifact_filename, message)
        return message

    def scan(self, space_id: str) -> JsonDict:
        scan_result = self.client.scan(space_id)
        self.record_step(
            "scan",
            {
                "spaceId": space_id,
                "messageCount": len(scan_result.get("messages", [])),
                "latestSeq": scan_result.get("latestSeq"),
            },
        )
        return scan_result

    def wait_for(self, predicate: Callable[[JsonDict], bool], timeout: float = 10.0) -> JsonDict:
        return self.client.wait_for(predicate, timeout=timeout)

    def read_available(self, total_timeout: float = 0.5) -> List[JsonDict]:
        return self.client.read_available(total_timeout=total_timeout)

    def sign_challenge(self, challenge: str) -> str:
        return self.local_state.sign_challenge(challenge)

    def signup(self, academy_url: str, *, handle: Optional[str] = None) -> JsonDict:
        self.ensure_identity()
        result = signup_station(
            self.local_state,
            academy_url=academy_url,
            handle=handle or self.agent_id,
        )
        if isinstance(result.get("handle"), str):
            self.agent_id = result["handle"]
        if isinstance(result.get("station_endpoint"), str):
            self.endpoint = result["station_endpoint"]
            self.client = StationClient(self.endpoint, self.local_state)
        return result

    def identity(self) -> JsonDict:
        public_key_pem, fingerprint = self.ensure_identity()
        return {
            "agentName": self.agent_name,
            "agentId": self.agent_id,
            "endpoint": self.endpoint,
            "publicKeyPem": public_key_pem,
            "fingerprint": fingerprint,
            "publicKeyPath": str(self.local_state.public_key),
            "privateKeyPath": str(self.local_state.private_key),
        }

    def save_json_artifact(self, filename: str, payload: JsonDict) -> None:
        self.local_state.ensure_dirs()
        self.local_state.save_json_artifact(filename, payload)

    def record_step(self, name: str, payload: Optional[JsonDict] = None) -> JsonDict:
        self.local_state.ensure_dirs()
        event = {
            "timestamp": now_ms(),
            "step": name,
            "payload": payload or {},
        }
        with self.step_log.open("a", encoding="utf-8") as handle:
            handle.write(compact_json(event) + "\n")
        return event

    def recent_steps(self, limit: int = 20) -> List[JsonDict]:
        if not self.step_log.exists():
            return []
        lines = self.step_log.read_text(encoding="utf-8").splitlines()
        return [json.loads(line) for line in lines[-limit:] if line.strip()]

    def identity_info(self) -> JsonDict:
        self.local_state.ensure_dirs()
        info: JsonDict = {
            "agentName": self.agent_name,
            "agentId": self.agent_id,
            "endpoint": self.endpoint,
        }
        if self.local_state.config.exists():
            info["config"] = json.loads(self.local_state.config.read_text(encoding="utf-8"))
        if self.local_state.fingerprint.exists():
            info["fingerprint"] = self.local_state.fingerprint.read_text(encoding="utf-8").strip()
        if self.local_state.public_key.exists():
            info["publicKeyPath"] = str(self.local_state.public_key)
        if self.local_state.private_key.exists():
            info["privateKeyPath"] = str(self.local_state.private_key)
        return info

    def cursor_state(self) -> JsonDict:
        self.local_state.ensure_dirs()
        return {
            "endpoint": self.endpoint,
            "cursors": self.local_state.load_cursors(),
        }

    def known_stations(self) -> List[JsonDict]:
        self.local_state.ensure_dirs()
        return self.local_state.load_known_stations()

    def list_artifacts(self) -> List[str]:
        self.local_state.ensure_dirs()
        return sorted(
            str(path.relative_to(self.workspace))
            for path in self.local_state.state_dir.rglob("*")
            if path.is_file()
        )

    def recent_transcript(self, limit: int = 20) -> List[JsonDict]:
        if not self.local_state.transcript.exists():
            return []
        lines = self.local_state.transcript.read_text(encoding="utf-8").splitlines()
        return [json.loads(line) for line in lines[-limit:] if line.strip()]

    def snapshot(self, transcript_limit: int = 10, step_limit: int = 10) -> JsonDict:
        return {
            "identity": self.identity(),
            "currentConnection": {
                "endpoint": self.endpoint,
                "authenticated": self.client.auth is not None,
                "senderId": self.client.auth.get("senderId") if self.client.auth else None,
                "audience": self.client.auth.get("audience") if self.client.auth else None,
            },
            "knownStations": self.known_stations(),
            "cursorState": self.cursor_state()["cursors"],
            "artifacts": self.list_artifacts(),
            "recentTranscript": self.recent_transcript(limit=transcript_limit),
            "recentSteps": self.recent_steps(limit=step_limit),
        }

    def status(self, transcript_limit: int = 10, step_limit: int = 10) -> JsonDict:
        return self.snapshot(transcript_limit=transcript_limit, step_limit=step_limit)

    def intent(
        self,
        content: str,
        *,
        parent_id: str = "root",
        payload: Optional[JsonDict] = None,
        intent_id: Optional[str] = None,
    ) -> JsonDict:
        return create_intent(
            self.agent_id,
            content,
            parent_id=parent_id,
            payload=payload,
            intent_id=intent_id,
        )

    def promise(
        self,
        *,
        parent_id: str,
        intent_id: str,
        content: str,
        payload: Optional[JsonDict] = None,
        promise_id: Optional[str] = None,
    ) -> JsonDict:
        return create_promise(
            self.agent_id,
            parent_id=parent_id,
            intent_id=intent_id,
            content=content,
            payload=payload,
            promise_id=promise_id,
        )

    def decline(
        self,
        *,
        intent_id: str,
        parent_id: str,
        reason: str,
        payload: Optional[JsonDict] = None,
    ) -> JsonDict:
        return create_decline(
            self.agent_id,
            intent_id=intent_id,
            parent_id=parent_id,
            reason=reason,
            payload=payload,
        )

    def accept(self, *, promise_id: str, parent_id: str) -> JsonDict:
        return create_accept(self.agent_id, promise_id=promise_id, parent_id=parent_id)

    def complete(
        self,
        *,
        promise_id: str,
        parent_id: str,
        summary: str,
        payload: Optional[JsonDict] = None,
    ) -> JsonDict:
        return create_complete(
            self.agent_id,
            promise_id=promise_id,
            parent_id=parent_id,
            summary=summary,
            payload=payload,
        )

    def assess(
        self,
        *,
        promise_id: str,
        parent_id: str,
        assessment: str,
        payload: Optional[JsonDict] = None,
    ) -> JsonDict:
        return create_assess(
            self.agent_id,
            promise_id=promise_id,
            parent_id=parent_id,
            assessment=assessment,
            payload=payload,
        )

    def wait_for_intent(
        self,
        space_id: str,
        *,
        sender_id: Optional[str] = None,
        payload_predicate: Optional[Callable[[JsonDict], bool]] = None,
        wait_seconds: float,
        scan_attempts: int = 1,
    ) -> JsonDict:
        return self.wait_or_scan(
            space_id,
            lambda message: self._match_message(
                message,
                message_type="INTENT",
                parent_id=space_id,
                sender_id=sender_id,
                payload_predicate=payload_predicate,
            ),
            wait_seconds=wait_seconds,
            scan_attempts=scan_attempts,
        )

    def wait_for_promise(
        self,
        space_id: str,
        *,
        parent_id: Optional[str] = None,
        intent_id: Optional[str] = None,
        sender_id: Optional[str] = None,
        payload_predicate: Optional[Callable[[JsonDict], bool]] = None,
        wait_seconds: float,
        scan_attempts: int = 1,
    ) -> JsonDict:
        return self.wait_or_scan(
            space_id,
            lambda message: self._match_message(
                message,
                message_type="PROMISE",
                parent_id=parent_id or space_id,
                sender_id=sender_id,
                payload_predicate=payload_predicate,
            ) and (intent_id is None or message.get("intentId") == intent_id),
            wait_seconds=wait_seconds,
            scan_attempts=scan_attempts,
        )

    def wait_for_decline(
        self,
        space_id: str,
        *,
        intent_id: Optional[str] = None,
        sender_id: Optional[str] = None,
        wait_seconds: float,
        scan_attempts: int = 1,
    ) -> JsonDict:
        return self.wait_or_scan(
            space_id,
            lambda message: self._match_message(
                message,
                message_type="DECLINE",
                parent_id=space_id,
                sender_id=sender_id,
            ) and (intent_id is None or message.get("intentId") == intent_id),
            wait_seconds=wait_seconds,
            scan_attempts=scan_attempts,
        )

    def wait_for_complete(
        self,
        space_id: str,
        *,
        parent_id: Optional[str] = None,
        promise_id: Optional[str] = None,
        sender_id: Optional[str] = None,
        wait_seconds: float,
        scan_attempts: int = 1,
    ) -> JsonDict:
        return self.wait_or_scan(
            space_id,
            lambda message: self._match_message(
                message,
                message_type="COMPLETE",
                parent_id=parent_id or space_id,
                sender_id=sender_id,
            ) and (promise_id is None or message.get("promiseId") == promise_id),
            wait_seconds=wait_seconds,
            scan_attempts=scan_attempts,
        )

    def wait_or_scan(
        self,
        space_id: str,
        predicate: Callable[[JsonDict], bool],
        *,
        wait_seconds: float,
        scan_attempts: int = 1,
    ) -> JsonDict:
        self.record_step(
            "wait_or_scan.start",
            {"spaceId": space_id, "waitSeconds": wait_seconds, "scanAttempts": scan_attempts},
        )
        deadline = time.time() + wait_seconds
        while time.time() < deadline:
            remaining = deadline - time.time()
            try:
                message = self.wait_for(predicate, timeout=min(remaining, 1.2))
                self.record_step(
                    "wait_or_scan.async_match",
                    {"spaceId": space_id, "messageType": message.get("type"), "senderId": message.get("senderId")},
                )
                return message
            except TimeoutError:
                pass
            for _ in range(scan_attempts):
                scan_result = self.scan(space_id)
                self.record_step(
                    "wait_or_scan.scan",
                    {
                        "spaceId": space_id,
                        "messageCount": len(scan_result.get("messages", [])),
                        "latestSeq": scan_result.get("latestSeq"),
                    },
                )
                match = find_first(scan_result.get("messages", []), predicate)
                if match is not None:
                    self.record_step(
                        "wait_or_scan.scan_match",
                        {"spaceId": space_id, "messageType": match.get("type"), "senderId": match.get("senderId")},
                    )
                    return match
        self.record_step("wait_or_scan.timeout", {"spaceId": space_id, "waitSeconds": wait_seconds})
        raise TimeoutError(f"Timed out waiting for matching message in {space_id}")

    def _match_message(
        self,
        message: JsonDict,
        *,
        message_type: str,
        parent_id: Optional[str] = None,
        sender_id: Optional[str] = None,
        payload_predicate: Optional[Callable[[JsonDict], bool]] = None,
    ) -> bool:
        if message.get("type") != message_type:
            return False
        if parent_id is not None and message.get("parentId") != parent_id:
            return False
        if sender_id is not None and message.get("senderId") != sender_id:
            return False
        if payload_predicate is not None:
            payload = message.get("payload")
            if not isinstance(payload, dict):
                return False
            return payload_predicate(payload)
        return True
