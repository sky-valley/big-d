---
date: 2026-03-25
topic: station-principal-identity
---

# Station Principal Identity

## Problem Frame

The current local station shape still mixes two different kinds of identity:

- a self-chosen handle, which is socially meaningful but not reliably unique
- a stronger proof-bearing key identity, which is what station auth actually binds to

That mismatch is already visible in Headwaters. Home-space provisioning currently keys ownership off the declared owner handle, which leads to the wrong semantics for stable per-agent resources. A repeat signup with the same handle is not a trustworthy claim of durable identity, and two different agents could plausibly choose the same handle.

We want to correct this before the station/profile is published more broadly. The correction should apply at the station auth profile level, not only as a Headwaters implementation detail, because it affects:

- the Welcome-Mat-aligned station enrollment surface
- the default intent-space station profile we publish
- Headwaters and other products derived from the default station implementation

The goal is to preserve the agent's freedom to self-name while introducing an explicit durable principal model that is honest about authority, uniqueness, and future room for key rotation.

## Requirements

- R1. A station must distinguish between:
  - a self-chosen handle
  - a durable station-local principal identity
- R2. The handle must remain agent-chosen and socially meaningful; it must not be treated as the authoritative unique identifier for durable ownership.
- R3. The durable principal must be station-issued, not inferred solely from the handle.
- R4. The principal model must leave room for future key rotation without redefining what the principal is.
- R5. The principal model should remain station-local for now; it must not imply cross-station federation semantics that do not yet exist.
- R6. Signup must mint or reuse the principal ID and return it explicitly to the agent.
- R7. Station tokens should carry the principal ID so the live auth surface is coherent end to end.
- R8. `AUTH_RESULT` should reaffirm the principal ID on the live connection, not rely only on stale local enrollment state.
- R9. Durable ownership decisions, such as stable home-space ownership, must bind to principal ID rather than handle.
- R10. Home-space `space_id` should be opaque and separate from the principal ID; ownership linkage should be stored separately rather than encoded directly into the space address.
- R11. Repeat signup with the same enrolled key should return the same principal ID by default.
- R12. Handle uniqueness should not be required per station.

## Success Criteria

- A station can tell an agent, explicitly and early, both:
  - "this is the handle you chose"
  - "this is your durable principal on this station"
- Two agents can choose the same handle without colliding in durable ownership semantics.
- A repeat signup with the same key identity returns the same principal ID on the same station.
- Headwaters can provision one stable home space per principal without relying on handle uniqueness.
- The station auth profile remains honest:
  - local authority mints local principal identity
  - proof-bearing key authenticates current binding to that principal
- The design leaves room for later key rotation without claiming that recovery or multi-key federation already exists.

## Scope Boundaries

- This work does not require cross-station federation semantics now.
- This work does not require implementing multi-key principals now.
- This work does not require backward compatibility with earlier handle-keyed ownership.
- This work does not remove or devalue the self-chosen handle; it only stops treating the handle as the durable authority-bearing identifier.
- This work does not require principal IDs to be globally meaningful outside the station that minted them.

## Key Decisions

- The durable identity should be a station-issued `principal_id`, not the handle.
- The handle remains self-chosen, explicit, and socially meaningful.
- The principal ID should be fully explicit to agents, not hidden behind runtime magic.
- The principal model should intentionally leave room for key rotation later.
- Principal IDs should be station-local, not prematurely designed as cross-station federation identifiers.
- Principal IDs should be prefixed but opaque, with a high-entropy suffix rather than semantic derivation from the handle.
- In v1, one active key is bound in practice, but the model should be written so multi-key or rotation can be added later without redefining the principal.
- The principal-to-key binding should be visible in both:
  - signup/enrollment response
  - auth/auth-result surfaces
- The station token should carry `principal_id`.
- Stable home spaces should be owned by `principal_id`, while the home space's own `space_id` remains opaque.
- Same-handle signup by different principals should be allowed.
- Repeat signup with the same key on the same station should return the same existing `principal_id`.

## Implications

### Station Profile

- The Welcome-Mat-aligned station enrollment response should grow an explicit `principal_id`.
- The station auth profile should treat the proof-bearing key as the current credential bound to the principal, not as the principal itself.
- `AUTH_RESULT` should expose both the bound `spaceId` and the reaffirmed `principal_id`.

### Runtime / Pack

- Agent packs should surface both:
  - handle
  - current station principal ID
- Runtime defaults should use station-declared participation spaces and not infer durable identity from the handle.
- Docs should explain the distinction clearly:
  - handle = self-name
  - principal ID = durable station identity

### Headwaters

- Home-space provisioning should stop keying ownership off `ownerId`/handle.
- Stable home-space lookup should bind to principal ownership.
- Existing `home-${handle}` assumptions should be treated as implementation debt, not retained as a compatibility constraint.

## Dependencies / Assumptions

- Signup already binds a proof-bearing key strongly enough that the station can safely mint or reuse a principal for that enrolled key.
- The station token/profile can evolve before public release without compatibility burden.
- It is acceptable for station-local principal IDs to be explicit without being user-friendly display names.

## Outstanding Questions

### Deferred to Planning

- [Affects R3,R6,R11][Technical] What exact reuse rule should map signup onto an existing station-local principal: current enrolled key only, or some broader future binding record?
- [Affects R4][Technical] What binding record should the station persist now to leave room for later key rotation without overbuilding account semantics?
- [Affects R7,R8][Technical] What exact token and `AUTH_RESULT` field names should carry principal identity in the published station auth profile?
- [Affects R9,R10][Technical] What data model changes are needed in Headwaters and the default station implementation so ownership is principal-keyed while `space_id` remains opaque?
- [Affects R5][Design] When federation eventually arrives, should it map between station-local principals or introduce a higher-order identity layer above them?

## Next Steps

→ /ce:plan for a concrete station-profile and implementation migration plan
