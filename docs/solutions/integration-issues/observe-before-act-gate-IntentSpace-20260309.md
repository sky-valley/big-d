---
module: intent-space
date: 2026-03-09
problem_type: protocol-correctness
component: intent-space server protocol (space.ts)
symptoms:
  - "Client could send INTENT messages simultaneously with connecting via nc piping"
  - "Space accepted and persisted intents before client observed service intents"
  - "Service intents (give-promises) were sent but not gated — decoration not contract"
  - "Space acted as doormat accepting any well-formed message without cooperative binding"
root_cause: No enforcement of introduction completion before accepting client messages — space lacked autonomy to finish its give-promise advertisement before processing incoming state
resolution_type: temporal-gate
severity: medium
tags:
  - promise-theory
  - cooperative-binding
  - imposition-prevention
  - protocol-invariant
  - intent-space
  - observe-before-act
---

# Observe-Before-Act Gate Missing in Intent Space

## Problem

The intent space server accepted client messages without finishing its introduction. Per Promise Theory, posting an intent without first observing the space's service intents is an imposition — the client forces state without cooperative binding.

When a user connected via `nc` and sent an INTENT simultaneously:

```bash
echo '{"type":"INTENT","intentId":"hello-1","senderId":"me","timestamp":1,"payload":{"content":"build auth"}}' | nc -U ~/.differ/loop/intent-space.sock
```

The server returned service intents AND the echo in one blast:

```
{"type":"INTENT","intentId":"intent-space:persist",...,"seq":1}
{"type":"INTENT","intentId":"intent-space:history",...,"seq":2}
{"type":"INTENT","intentId":"intent-space:containment",...,"seq":3}
{"type":"INTENT","intentId":"hello-1","senderId":"me",...,"seq":4}
```

The client never observed the space's give-promises before writing. The service intents were decoration, not a gate. The space was a doormat.

## Investigation

Consulted two expert perspectives:

**Jeff Dean (distributed systems):** "The client can write before reading. Discovery should be passive — observe, then act. Don't add a USE message, that's CORBA thinking. Just gate: the space doesn't process client messages until it's finished sending service intents. One-way gate, zero new message types."

**Mark Burgess (Promise Theory):** "The temporal ordering matters. +b(space->client) is the service intent — the give-promise. -b(client->space) is the act of posting after observing — the use-promise. The client must observe before it acts. That's not a handshake; it's respecting the autonomy of the space to finish speaking before being spoken to."

The issue is one of temporal ordering in the Promise Theory binding sequence. When the client writes before the space finishes introducing itself, the -b happens before the +b is complete. The cooperative binding is violated; the client imposes rather than cooperates.

## Solution

Added an `introduced` boolean gate to `ClientConnection` in `space.ts`. The gate starts `false`, flips to `true` after `sendServiceIntents()` completes, and `handleMessage()` rejects any inbound message while the gate is closed.

### Code changes

**Interface — added `introduced` flag:**

```typescript
interface ClientConnection {
  socket: Socket;
  buffer: string;
  introduced: boolean;
}
```

**Connection handler — gate set synchronously after service intents are sent:**

```typescript
private handleConnection(socket: Socket): void {
  const client: ClientConnection = { socket, buffer: '', introduced: false };
  this.clients.add(client);

  // The space finishes speaking before accepting input (observe-before-act).
  this.sendServiceIntents(client);
  client.introduced = true;

  socket.on('data', (chunk: Buffer) => this.handleData(client, chunk.toString()));
  socket.on('close', () => this.clients.delete(client));
  socket.on('error', () => this.clients.delete(client));
}
```

**Message handler — reject if space hasn't finished introducing itself:**

```typescript
private handleMessage(client: ClientConnection, msg: ClientMessage): void {
  if (!client.introduced) {
    this.send(client, {
      type: 'ERROR',
      message: 'Space is still introducing itself — observe before acting',
    });
    return;
  }
  // ... normal dispatch
}
```

### Documentation updates

- **INTENT-SPACE.md**: Connection section renamed to "Connection — observe before act". Explains +b/-b binding through temporal ordering. No new message types — the ordering alone encodes the cooperative binding.
- **Invariant 8 added**: "Observe before act. The space finishes its introduction before accepting client messages. The temporal ordering — space speaks first, client acts after — encodes the cooperative binding without additional message types."
- Eight invariants total now (was seven).

### Why it works

The gate works because Node.js event loop guarantees `introduced = true` is set synchronously before any `data` event fires for that client. All 17 tests pass — existing tests already observe before acting (they `await client.connect()` then wait for service intents).

## Prevention

### Protocol design principles

1. **Phase-gated connections as default.** Every protocol connection should begin in a restrictive phase. Message handlers check the phase before dispatching. Default is "reject everything except the introduction sequence." Invert the common mistake: reject by default, open after handshake.

2. **Give-promises are not decorative.** A server's introduction is the mechanism by which the client learns what the server will do. If the client skips this, it operates on assumptions rather than commitments. Design protocols so the client cannot construct valid requests without information from the introduction.

3. **Temporal invariants alongside structural ones.** Most protocol documentation describes message shapes but omits temporal ordering constraints. Every protocol spec should include a connection timeline: who speaks first, what must complete before the other party may speak, what happens if ordering is violated.

4. **Autonomy means the right to not be ready.** An autonomous agent has the right to not be ready. A protocol that allows clients to send messages before the server declares readiness violates the server's autonomy. "Not ready" must be a first-class, enforceable state.

### Testing recommendations

- **Premature message injection**: Send a valid INTENT immediately on connect before service intents arrive. Assert ERROR response.
- **Mid-introduction injection**: If introduction has multiple messages, inject between first and last. Assert rejection.
- **Race under load**: Open many connections simultaneously, each writing at connect with zero delay. Verify gate holds.
- **Reconnection phase reset**: Disconnect and reconnect. Verify new connection starts un-introduced.
- **Post-introduction happy path**: Verify messages accepted normally after introduction completes (control test).

## Related Issues

- [Protocol Sprawl & Missing Fractal Containment](../architecture/protocol-sprawl-missing-fractal-containment-IntentSpace-20260309.md) — Parent redesign that established the two-family protocol and seven (now eight) invariants
- [Intent Space as Promise Theory Participant](intent-space-promise-theory-participant.md) — Service intents as self-description, bootstrap ordering
- [Promise Theory Informed Architecture](../architecture-decisions/promise-theory-informed-architecture.md) — Foundational patterns: cooperative binding, no imposition, scoping as observer's responsibility
