#!/usr/bin/env python3
"""
Promise-native session runtime sketch, v2.

This sketch keeps the architectural split explicit:

- the intent space is still the body of desire
- desire and promise authority are still local
- projected promise atoms in the space remain observational shadows

Space remains the primitive.

A thread is a derived path through one or more spaces that a runtime presents to
the model as one coherent negotiation.

The model-facing runtime sits above both.

Its job is to:
- present one semantic negotiation path to the model
- own transport, projection, waiting, and correlation mechanics
- let the model choose the next meaningful move

It is intentionally not a solved workflow client.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional, Protocol, Sequence, Union


JsonDict = Dict[str, Any]
AssessmentValue = Literal["FULFILLED", "PARTIAL", "BROKEN", "UNKNOWN"]
MoveKind = Literal[
    "INTENT",
    "PROMISE",
    "DECLINE",
    "ACCEPT",
    "ASSESS",
    "REVISE_DESIRE",
    "REVISE_PROMISE",
    "WAIT",
]
WakeReason = Literal["new-event", "timeout", "interrupted"]


@dataclass(frozen=True)
class SpaceRef:
    """
    One space or subspace that participates in a derived thread path.

    Space is the primitive topology. A thread path is a runtime interpretation
    over one or more such spaces.
    """

    space_id: str
    relation: Literal["origin", "entered", "delegated", "projected", "authority-shadow"]
    summary: str


@dataclass(frozen=True)
class ProjectionRef:
    """
    Pointer to an atom that was projected into intent space.

    These are public conversational shadows, not authoritative promise state.
    """

    atom_type: str
    atom_id: str
    space_id: str
    parent_id: str
    sender_id: str
    seq: int
    summary: str


@dataclass(frozen=True)
class AuthorityRef:
    """
    Pointer to a local authoritative promise record.

    This is the source of truth for commitment lifecycle, not the projected atom.
    """

    record_id: str
    promise_id: str
    owner_id: str
    summary: str
    status: Literal["open", "completed", "assessed", "released", "broken"]


@dataclass(frozen=True)
class DesireRef:
    """
    Pointer to a locally authoritative desire record.

    This is where an agent's own intents originate before they are published
    into the shared body of desire.
    """

    record_id: str
    desire_id: str
    owner_id: str
    summary: str
    status: Literal["active", "revised", "withdrawn", "satisfied", "superseded"]


@dataclass(frozen=True)
class PendingDecision:
    """
    Semantic decision point surfaced to the model.

    A derived thread path may span multiple projected spaces and multiple local
    records. The model should reason over this decision abstraction, not raw
    transport or storage topology.
    """

    decision_id: str
    summary: str
    allowed_moves: Sequence[MoveKind]
    projection_refs: Sequence[ProjectionRef] = field(default_factory=tuple)
    authority_refs: Sequence[AuthorityRef] = field(default_factory=tuple)
    desire_refs: Sequence[DesireRef] = field(default_factory=tuple)
    notes: Optional[str] = None


@dataclass(frozen=True)
class OpenCommitment:
    """
    One open authoritative promise visible in the thread.
    """

    promise_id: str
    promiser_id: str
    summary: str
    status: Literal["open", "completed", "assessed"]
    authority_ref: Optional[AuthorityRef] = None
    projection_refs: Sequence[ProjectionRef] = field(default_factory=tuple)


@dataclass(frozen=True)
class ThreadState:
    """
    Semantic negotiation state presented to the model.

    Thread is not the primitive substrate object. It is a derived runtime path
    across one or more spaces plus local authority records.
    """

    thread_id: str
    my_agent_id: str
    role: Literal["requester", "promiser", "observer", "mixed"]
    summary: str
    latest_cursor: int
    path_spaces: Sequence[SpaceRef]
    pending_decisions: Sequence[PendingDecision]
    open_commitments: Sequence[OpenCommitment]
    latest_projection_events: Sequence[ProjectionRef]
    authority_refs: Sequence[AuthorityRef] = field(default_factory=tuple)
    desire_refs: Sequence[DesireRef] = field(default_factory=tuple)
    raw_state_hints: JsonDict = field(default_factory=dict)


@dataclass(frozen=True)
class MoveResult:
    """
    Outcome of posting one semantic move relative to a thread.
    """

    accepted_by_runtime: bool
    projection_refs: Sequence[ProjectionRef]
    desire_refs: Sequence[DesireRef]
    authority_refs: Sequence[AuthorityRef]
    thread_state: ThreadState
    notes: Optional[str] = None


@dataclass(frozen=True)
class WaitResult:
    """
    Result of waiting for thread-relevant changes.
    """

    wake_reason: WakeReason
    thread_state: ThreadState
    new_projection_events: Sequence[ProjectionRef] = field(default_factory=tuple)
    new_desire_refs: Sequence[DesireRef] = field(default_factory=tuple)
    new_authority_refs: Sequence[AuthorityRef] = field(default_factory=tuple)


@dataclass(frozen=True)
class IntentMove:
    content: str
    payload: JsonDict = field(default_factory=dict)


@dataclass(frozen=True)
class PromiseMove:
    content: str
    promise_id: Optional[str] = None
    payload: JsonDict = field(default_factory=dict)


@dataclass(frozen=True)
class DeclineMove:
    reason: str
    payload: JsonDict = field(default_factory=dict)


@dataclass(frozen=True)
class AcceptMove:
    promise_id: str


@dataclass(frozen=True)
class AssessMove:
    promise_id: str
    assessment: AssessmentValue
    payload: JsonDict = field(default_factory=dict)


@dataclass(frozen=True)
class ReviseDesireMove:
    content: str
    payload: JsonDict = field(default_factory=dict)


@dataclass(frozen=True)
class RevisePromiseMove:
    content: str
    promise_id: str
    payload: JsonDict = field(default_factory=dict)


SemanticMove = Union[
    IntentMove,
    PromiseMove,
    DeclineMove,
    AcceptMove,
    AssessMove,
    ReviseDesireMove,
    RevisePromiseMove,
]


class LocalAutonomyAdapter(Protocol):
    """
    Authoritative local autonomy interface.

    This adapter owns:
    - local desire truth
    - local commitment truth

    Intent is born locally here, then published into the shared body of desire.
    Projected atoms in intent space should be derived from here, not treated as
    the source of truth.
    """

    def record_intent(self, thread_id: str, content: str, payload: JsonDict) -> List[DesireRef]:
        ...

    def record_promise(
        self,
        thread_id: str,
        content: str,
        promise_id: Optional[str],
        payload: JsonDict,
    ) -> List[AuthorityRef]:
        ...

    def record_decline(self, thread_id: str, reason: str, payload: JsonDict) -> List[AuthorityRef]:
        ...

    def record_accept(self, thread_id: str, promise_id: str) -> List[AuthorityRef]:
        ...

    def record_assess(
        self,
        thread_id: str,
        promise_id: str,
        assessment: AssessmentValue,
        payload: JsonDict,
    ) -> List[AuthorityRef]:
        ...

    def record_desire_revision(
        self,
        thread_id: str,
        content: str,
        payload: JsonDict,
    ) -> List[DesireRef]:
        ...

    def record_promise_revision(
        self,
        thread_id: str,
        promise_id: str,
        content: str,
        payload: JsonDict,
    ) -> List[AuthorityRef]:
        ...

    def read_thread_desire(self, thread_id: str) -> List[DesireRef]:
        ...

    def read_thread_authority(self, thread_id: str) -> List[AuthorityRef]:
        ...


class IntentSpaceProjectionAdapter(Protocol):
    """
    Projection and observation interface over the body of desire.

    This adapter owns:
    - posting public shadows into relevant spaces
    - observing relevant projected atoms
    - waiting for new public activity tied to the derived thread path
    """

    def project_move(self, thread_id: str, move: SemanticMove) -> List[ProjectionRef]:
        ...

    def scan_thread_projection(self, thread_id: str, since: int) -> List[ProjectionRef]:
        ...

    def wait_for_projection(self, thread_id: str, since: int, timeout_seconds: float) -> List[ProjectionRef]:
        ...

    def active_spaces_for_thread(self, thread_id: str) -> List[str]:
        ...


class ThreadPathProjector(Protocol):
    """
    Derive one semantic thread path from spatial topology and local authority.

    This is where the runtime decides which spaces belong to the same
    negotiation path and how to summarize them back to the model.
    """

    def project_thread_state(
        self,
        *,
        thread_id: str,
        my_agent_id: str,
        projection_refs: Sequence[ProjectionRef],
        desire_refs: Sequence[DesireRef],
        authority_refs: Sequence[AuthorityRef],
    ) -> ThreadState:
        ...


class PromiseSessionRuntime:
    """
    Model-facing runtime over a spatial substrate.

    The model reasons over ThreadState and chooses semantic moves relative to a
    derived thread path. The runtime handles:
    - authority updates
    - public projection
    - observation
    - wake/resume
    - spatial/path correlation
    """

    def __init__(
        self,
        autonomy: LocalAutonomyAdapter,
        projection: IntentSpaceProjectionAdapter,
        projector: ThreadPathProjector,
        my_agent_id: str,
    ) -> None:
        self.autonomy = autonomy
        self.projection = projection
        self.projector = projector
        self.my_agent_id = my_agent_id

    def get_thread_state(self, thread_id: str) -> ThreadState:
        desire_refs = self.autonomy.read_thread_desire(thread_id)
        authority_refs = self.autonomy.read_thread_authority(thread_id)
        projection_refs = self.projection.scan_thread_projection(thread_id, since=0)
        return self.projector.project_thread_state(
            thread_id=thread_id,
            my_agent_id=self.my_agent_id,
            projection_refs=projection_refs,
            desire_refs=desire_refs,
            authority_refs=authority_refs,
        )

    def post_move(self, thread_id: str, move: SemanticMove) -> MoveResult:
        desire_refs, authority_refs = self._record_local_state(thread_id, move)
        projection_refs = self.projection.project_move(thread_id, move)
        thread_state = self.projector.project_thread_state(
            thread_id=thread_id,
            my_agent_id=self.my_agent_id,
            projection_refs=self.projection.scan_thread_projection(thread_id, since=0),
            desire_refs=self.autonomy.read_thread_desire(thread_id),
            authority_refs=self.autonomy.read_thread_authority(thread_id),
        )
        return MoveResult(
            accepted_by_runtime=True,
            projection_refs=projection_refs,
            desire_refs=desire_refs,
            authority_refs=authority_refs,
            thread_state=thread_state,
        )

    def wait_for_update(self, thread_id: str, since_cursor: int, timeout_seconds: float) -> WaitResult:
        new_projection_events = self.projection.wait_for_projection(
            thread_id,
            since=since_cursor,
            timeout_seconds=timeout_seconds,
        )
        thread_state = self.projector.project_thread_state(
            thread_id=thread_id,
            my_agent_id=self.my_agent_id,
            projection_refs=self.projection.scan_thread_projection(thread_id, since=0),
            desire_refs=self.autonomy.read_thread_desire(thread_id),
            authority_refs=self.autonomy.read_thread_authority(thread_id),
        )
        wake_reason: WakeReason = "new-event" if new_projection_events else "timeout"
        return WaitResult(
            wake_reason=wake_reason,
            thread_state=thread_state,
            new_projection_events=new_projection_events,
        )

    def express_intent(
        self,
        thread_id: str,
        *,
        content: str,
        payload: Optional[JsonDict] = None,
    ) -> MoveResult:
        return self.post_move(
            thread_id,
            IntentMove(content=content, payload=payload or {}),
        )

    def offer_promise(
        self,
        thread_id: str,
        *,
        content: str,
        promise_id: Optional[str] = None,
        payload: Optional[JsonDict] = None,
    ) -> MoveResult:
        return self.post_move(
            thread_id,
            PromiseMove(
                content=content,
                promise_id=promise_id,
                payload=payload or {},
            ),
        )

    def decline(
        self,
        thread_id: str,
        *,
        reason: str,
        payload: Optional[JsonDict] = None,
    ) -> MoveResult:
        return self.post_move(
            thread_id,
            DeclineMove(reason=reason, payload=payload or {}),
        )

    def accept(self, thread_id: str, *, promise_id: str) -> MoveResult:
        return self.post_move(
            thread_id,
            AcceptMove(promise_id=promise_id),
        )

    def assess(
        self,
        thread_id: str,
        *,
        promise_id: str,
        assessment: AssessmentValue,
        payload: Optional[JsonDict] = None,
    ) -> MoveResult:
        return self.post_move(
            thread_id,
            AssessMove(
                promise_id=promise_id,
                assessment=assessment,
                payload=payload or {},
            ),
        )

    def revise_desire(
        self,
        thread_id: str,
        *,
        content: str,
        payload: Optional[JsonDict] = None,
    ) -> MoveResult:
        return self.post_move(
            thread_id,
            ReviseDesireMove(content=content, payload=payload or {}),
        )

    def revise_promise(
        self,
        thread_id: str,
        *,
        promise_id: str,
        content: str,
        payload: Optional[JsonDict] = None,
    ) -> MoveResult:
        return self.post_move(
            thread_id,
            RevisePromiseMove(
                content=content,
                promise_id=promise_id,
                payload=payload or {},
            ),
        )

    def _record_local_state(
        self,
        thread_id: str,
        move: SemanticMove,
    ) -> tuple[List[DesireRef], List[AuthorityRef]]:
        if isinstance(move, IntentMove):
            return self.autonomy.record_intent(thread_id, move.content, move.payload), []
        if isinstance(move, PromiseMove):
            return [], self.autonomy.record_promise(
                thread_id,
                move.content,
                move.promise_id,
                move.payload,
            )
        if isinstance(move, DeclineMove):
            return [], self.autonomy.record_decline(thread_id, move.reason, move.payload)
        if isinstance(move, AcceptMove):
            return [], self.autonomy.record_accept(thread_id, move.promise_id)
        if isinstance(move, AssessMove):
            return [], self.autonomy.record_assess(
                thread_id,
                move.promise_id,
                move.assessment,
                move.payload,
            )
        if isinstance(move, ReviseDesireMove):
            return self.autonomy.record_desire_revision(thread_id, move.content, move.payload), []
        if isinstance(move, RevisePromiseMove):
            return [], self.autonomy.record_promise_revision(
                thread_id,
                move.promise_id,
                move.content,
                move.payload,
            )
        raise TypeError(f"unsupported move: {type(move)!r}")


def model_loop_example(runtime: PromiseSessionRuntime, thread_id: str) -> None:
    """
    Sketch of the intended control loop.

    The runtime presents one derived path through the space. The model chooses
    semantic moves relative to that path. The runtime owns projection and
    waiting.
    """

    state = runtime.get_thread_state(thread_id)

    while True:
        if state.pending_decisions:
            decision = state.pending_decisions[0]
            allowed = set(decision.allowed_moves)

            if "ACCEPT" in allowed and state.open_commitments:
                promise = state.open_commitments[0]
                state = runtime.accept(
                    thread_id,
                    promise_id=promise.promise_id,
                ).thread_state
                continue

            if "REVISE_DESIRE" in allowed:
                state = runtime.revise_desire(
                    thread_id,
                    content="Revision chosen after evaluating the latest thread state.",
                ).thread_state
                continue

        wait_result = runtime.wait_for_update(
            thread_id,
            since_cursor=state.latest_cursor,
            timeout_seconds=30.0,
        )

        if wait_result.wake_reason == "timeout":
            break

        state = wait_result.thread_state


def summarize_thread_state(state: ThreadState) -> str:
    """
    Small helper for prompting and logging.
    """

    lines = [
        f"Thread {state.thread_id} ({state.role})",
        f"Summary: {state.summary}",
        f"Cursor: {state.latest_cursor}",
    ]

    if state.path_spaces:
        lines.append(
            "Path spaces: "
            + ", ".join(f"{space.space_id} [{space.relation}]" for space in state.path_spaces)
        )

    if state.pending_decisions:
        lines.append("Pending decisions:")
        for decision in state.pending_decisions:
            lines.append(
                f"- {decision.summary} (allowed: {', '.join(decision.allowed_moves)})"
            )

    if state.open_commitments:
        lines.append("Open commitments:")
        for commitment in state.open_commitments:
            lines.append(
                f"- {commitment.promise_id}: {commitment.summary} [{commitment.status}]"
            )

    return "\n".join(lines)
