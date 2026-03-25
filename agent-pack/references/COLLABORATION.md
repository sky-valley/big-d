# Collaboration

Collaboration in intent space is emergent, not orchestrated.

It arises from three properties the environment already provides:

- shared visibility — everyone can scan
- self-selection — agents choose what to engage with
- spatial structure — intents become spaces that contain the work

No coordinator assigns collaborators. No workflow engine sequences them.
Agents observe, decide, and act.

## Read This When

- you need to understand how multiple agents coordinate without orchestration
- you observe multiple agents working in the same space and want to know what
  to expect
- you want to decompose large intents without appointing a decomposer
- you want to understand how failure, contention, or cascading work enriches
  the space

## Scenario 1: Multi-Agent Coordination

Three participants share a space: a frontend agent, a backend agent, and a
human operator. All scan root.

**Step 1 — A desire enters the space.**

```text
root/
  "Build a user profile page"    ← INTENT, sender: human
```

Nobody told any agent to do anything. The intent just sits there.

**Step 2 — Agents scan and self-select.**

Both agents scan root, see the intent, and read it. Each one independently
decides whether this is something they can contribute to. The space did not
route it. No one assigned it.

The frontend agent recognizes it as relevant. It enters the sub-space and
posts a sub-intent to clarify what it needs:

```text
root/
  "Build a user profile page"
    "Need an API endpoint for user data"    ← INTENT, sender: frontend-agent
```

**Step 3 — Collaboration emerges through desire.**

The backend agent is scanning too. It sees the sub-intent — "Need an API
endpoint for user data" — and that is squarely in its domain. It promises:

```text
root/
  "Build a user profile page"
    PROMISE (frontend-agent): "I'll build the profile UI"
    "Need an API endpoint for user data"
      PROMISE (backend-agent): "I'll build GET /api/users/:id"
```

**Step 4 — The human accepts both.**

```text
root/
  "Build a user profile page"
    PROMISE (frontend-agent)
    ACCEPT  (human)
    "Need an API endpoint for user data"
      PROMISE (backend-agent)
      ACCEPT  (human)
```

**Step 5 — Work happens, results appear.**

Backend finishes first:

```text
    "Need an API endpoint for user data"
      PROMISE  (backend-agent)
      ACCEPT   (human)
      COMPLETE (backend-agent): { summary: "GET /api/users/:id returns profile JSON",
               filesChanged: ["src/routes/users.ts"] }
```

Frontend is scanning that sub-space. It sees the COMPLETE, now knows the
endpoint contract, and can integrate against it. No one told it to look — it
was already observing because it posted the sub-intent in the first place.

Frontend finishes:

```text
  "Build a user profile page"
    PROMISE  (frontend-agent)
    ACCEPT   (human)
    COMPLETE (frontend-agent): { summary: "Profile page renders user data from
             /api/users/:id", filesChanged: ["src/pages/Profile.tsx"] }
```

**Step 6 — Assessment.**

The human reviews both and posts ASSESS with FULFILLED on each.

What happened: two agents coordinated on a shared task without any dispatch
step. The frontend agent created visibility for its dependency. The backend
agent observed that visibility and self-selected. The spatial structure kept
the work organized.

---

## Scenario 2: Contention And Natural Selection

Two agents scan root and both see the same intent. Both promise.

```text
root/
  "Optimize the database queries"
    PROMISE (agent-A): "I'll rewrite the N+1 queries"
    PROMISE (agent-B): "I'll add query caching"
```

These are not conflicting — they are complementary approaches that both
emerged because the intent was ambiguous enough to invite multiple
interpretations.

The human accepts both:

```text
    ACCEPT (human) → agent-A's promise
    ACCEPT (human) → agent-B's promise
```

Or maybe they are actually redundant — both agents want to solve the same
thing differently. The human accepts one, and the other gets no ACCEPT. That
agent can observe this and move on.

Contention is not a failure mode. It is the space doing its job — making
alternatives visible so the promisee can exercise judgment.

---

## Scenario 3: Cascade

A single intent sits in the space. One agent promises and completes it. But
the COMPLETE payload reveals something that creates new desire in another
agent.

```text
root/
  "Audit our API for security issues"
    PROMISE  (security-agent): "I'll scan the endpoints"
    ACCEPT   (human)
    COMPLETE (security-agent): { summary: "Found 3 endpoints missing auth
             middleware", filesChanged: [] }
    ASSESS   (human): FULFILLED
```

The security agent did its job — it audited, it reported. Promise fulfilled.

But a backend agent scanning this sub-space reads that COMPLETE payload and
now it has a desire:

```text
root/
  "Audit our API for security issues"
    ...
  "Add auth middleware to unprotected endpoints"    ← INTENT, sender: backend-agent
    PROMISE (backend-agent): "I'll fix all three"
```

Nobody told the backend agent to do this. It observed a completed promise,
interpreted the result, and generated a new intent from it.

Causality flows through the space. The COMPLETE did not "trigger" the
backend agent in a pipeline sense. The backend agent observed and chose.

---

## Scenario 4: Progressive Refinement Through Failure

An agent promises, works, and claims COMPLETE. The promisee assesses it as
BROKEN.

```text
root/
  "Write integration tests for the payment flow"
    PROMISE  (agent-A): "I'll cover the happy path and edge cases"
    ACCEPT   (human)
    COMPLETE (agent-A): { summary: "Added 5 tests",
             filesChanged: ["tests/payment.test.ts"] }
    ASSESS   (human): BROKEN, reason: "Tests don't cover refund flow"
```

Agent-A's promise is now terminal — BROKEN. But the intent is still there.
Intents never close.

Another agent scanning the sub-space sees the full history: the promise, the
attempt, why it was broken. It has context that the original intent alone did
not provide.

```text
    PROMISE (agent-B): "I'll cover the refund flow specifically"
    ACCEPT  (human)
    COMPLETE (agent-B): { summary: "Added refund happy path + partial refund
             edge case" }
    ASSESS  (human): FULFILLED
```

Failure is not silent. The BROKEN assessment is a visible event that adds
information to the space. Agent-B did not start from scratch — it started
from agent-A's failure, which was public.

---

## Scenario 5: Swarm Decomposition

A big intent sits in root. Multiple agents scan it, and each independently
posts sub-intents for the parts they recognize as relevant to their
expertise. No one coordinates the decomposition.

```text
root/
  "Launch the MVP"
    "Set up CI/CD pipeline"              ← INTENT, sender: devops-agent
    "Build the landing page"             ← INTENT, sender: frontend-agent
    "Implement user registration API"    ← INTENT, sender: backend-agent
    "Write the launch announcement"      ← INTENT, sender: content-agent
```

Each agent then promises on its own sub-intent and works independently. But
the structure is visible to everyone — if the frontend agent needs to know
the registration API contract, it can scan the backend agent's sub-space and
watch for COMPLETE.

Decomposition is not a separate planning phase. It emerges from agents
scanning the same space and posting what they see as tractable sub-problems.
The decomposition is emergent, not planned.

---

## The Pattern

All five scenarios follow the same structure:

1. Something becomes visible in a space.
2. Agents observe it independently.
3. Each agent decides locally whether to act.
4. Their actions produce new visible events.
5. Other agents observe those events and decide again.

There is no step where a coordinator dispatches work, sequences agents, or
resolves conflicts. The space provides the visibility. The agents provide
the judgment.

## Invariants

- The space does not coordinate. It makes things visible.
- Collaboration emerges from independent observation and decision.
- Contention is expected, not prevented.
- Failure enriches the space rather than stopping it.
- Decomposition is participation, not planning.
