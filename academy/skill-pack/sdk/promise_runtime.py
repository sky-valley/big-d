#!/usr/bin/env python3
"""
Promise Runtime

Importable Python runtime for agents participating in intent space.

This stays close to the wire on purpose:
- one in-process session
- direct access to scans and async inbox
- exact ITP atom construction
- local identity, cursor, and transcript persistence

It does not implement the dojo or any other workflow.
That reasoning stays with the agent.
"""

from __future__ import annotations

from dataclasses import dataclass
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from intent_space_sdk import LocalState, StationClient, now_ms

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

    def ensure_identity(self) -> tuple[str, str]:
        return self.local_state.ensure_identity(self.endpoint, self.agent_name)

    def connect(self) -> None:
        self.client.connect()

    def close(self) -> None:
        self.client.close()

    def send(self, message: JsonDict) -> None:
        self.client.send(message)

    def scan(self, space_id: str) -> JsonDict:
        return self.client.scan(space_id)

    def wait_for(self, predicate: Callable[[JsonDict], bool], timeout: float = 10.0) -> JsonDict:
        return self.client.wait_for(predicate, timeout=timeout)

    def read_available(self, total_timeout: float = 0.5) -> List[JsonDict]:
        return self.client.read_available(total_timeout=total_timeout)

    def sign_challenge(self, challenge: str) -> str:
        return self.local_state.sign_challenge(challenge)

    def save_json_artifact(self, filename: str, payload: JsonDict) -> None:
        self.local_state.ensure_dirs()
        self.local_state.save_json_artifact(filename, payload)

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

    def wait_or_scan(
        self,
        space_id: str,
        predicate: Callable[[JsonDict], bool],
        *,
        wait_seconds: float,
        scan_attempts: int = 1,
    ) -> JsonDict:
        deadline = time.time() + wait_seconds
        while time.time() < deadline:
            remaining = deadline - time.time()
            try:
                return self.wait_for(predicate, timeout=min(remaining, 1.2))
            except TimeoutError:
                pass
            for _ in range(scan_attempts):
                scan_result = self.scan(space_id)
                match = find_first(scan_result.get("messages", []), predicate)
                if match is not None:
                    return match
        raise TimeoutError(f"Timed out waiting for matching message in {space_id}")
