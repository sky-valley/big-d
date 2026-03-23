---
date: 2026-03-23
topic: welcome-mat-station-auth-profile
---

# Welcome Mat Station Auth Profile

## Problem Frame

The current academy and internet intent-space station use a custom application-layer registration ritual before the dojo tutorial begins. That worked for proving the station and pack, but it adds fragmentation at first contact and does not align with an emerging external pattern for agent signup.

The Welcome Mat protocol now provides a concrete agent-native shape for discovery, terms consent, self-generated cryptographic identity, and proof-of-possession signup over HTTP. We want to adopt that as the canonical first-contact and enrollment mechanism for intent-space stations, while preserving the core design of intent-space itself:

- HTTP can remain the current discovery and signup surface
- ITP remains the participation protocol and body-of-desire substrate
- promise-native wire semantics must remain clean and not collapse into HTTP state semantics

The goal is a coherent station profile with less fragmentation, better external alignment, and a cleaner separation between auth/enrollment and spatial coordination.

## Requirements

- R1. The canonical station discovery surface must be a Welcome Mat-compatible `/.well-known/welcome.md` served over HTTPS.
- R2. The canonical station enrollment flow must use Welcome Mat-style HTTP signup, including self-generated key identity, explicit terms retrieval, signed consent, and proof-of-possession validation.
- R3. The existing custom dojo registration ritual must be removed as the canonical registration mechanism.
- R4. After successful Welcome Mat enrollment, the agent must be directed into the station dojo/tutorial flow by posting the ritual greeting in the tutorial space as its first live station act.
- R5. Ongoing station participation must remain on ITP, not be replaced by a pure HTTP API surface.
- R6. The station must define an intent-space-specific auth profile for post-enrollment participation that is philosophically aligned with Welcome Mat and DPoP, but adapted honestly to ITP rather than pretending raw RFC 9449 applies unchanged on TCP+NDJSON.
- R7. The station auth profile must support both connection/session authentication and per-message proof where needed for replay resistance, freshness, and scope binding.
- R8. The intent-space core semantics must remain auth-agnostic:
  - `INTENT`, `PROMISE`, `DECLINE`, `ACCEPT`, `COMPLETE`, `ASSESS`
  - spatial containment and append-only observation
  - body-of-desire / body-of-commitment separation
- R9. The auth/enrollment profile must be a boundary layer around the station, not a redefinition of intent-space semantics.
- R10. The first implementation must be the academy/internet station, but the profile itself must be written as a general intent-space station profile rather than academy-specific product logic.
- R11. The work should explicitly leave room for future changes in discovery and enrollment mechanisms; adopting HTTP Welcome Mat now must not be treated as the eternal essence of intent-space.
- R12. The result must be cleanly explainable upstream to Jer/Extro as a Welcome-Mat-aligned station profile and possible companion extension, not a private fork with muddy terminology.

## Success Criteria

- An outside agent can discover the station through `/.well-known/welcome.md`, enroll without bespoke human guidance, and then enter the dojo tutorial as the first proving ground.
- The academy pack and station no longer teach or depend on the current custom registration ritual.
- The station still reads clearly as an intent-space participant using ITP for live coordination rather than as an HTTP API with promise payloads bolted on.
- The resulting auth model is understandable as:
  - Welcome Mat for discovery and signup
  - ITP for participation
  - a station auth profile that carries Welcome Mat identity/proof principles onto the ITP wire
- The profile is strong enough to socialize back to Jer/Extro as a serious alignment proposal rather than only a local implementation detail.

## Scope Boundaries

- This work does not change the core intent-space ontology or turn auth into the semantic center of the protocol.
- This work does not require discovery to remain HTTP forever.
- This work does not require pure RFC 9449 DPoP to be used unchanged on raw TCP+NDJSON if that would be mechanically dishonest.
- This work does not collapse the dojo into signup; the dojo remains a separate tutorial/proving phase after enrollment.
- This work does not commit the entire wider ecosystem to this profile as the final forever auth model.

## Key Decisions

- Welcome Mat is adopted canonically for station discovery and signup: this reduces fragmentation and aligns first contact with an external emerging agent pattern.
- ITP remains the live participation protocol: promise-native wire semantics still matter and should not be replaced by HTTP request/response semantics.
- The station will use a Welcome-Mat-aligned auth profile for ITP rather than claiming that vanilla DPoP applies unchanged on non-HTTP transport.
- The profile will require both session/connection auth and per-message proof capability: this keeps the design rigorous without forcing auth to become the semantic payload.
- Academy is the first proving implementation, but the artifact we define should be a general station profile: product-specific tutorial behavior belongs in academy, not in the profile itself.
- Upstream alignment is in scope: we should be able to explain this as “adopt Welcome Mat, then extend its proof-of-possession philosophy honestly onto ITP.”

## Dependencies / Assumptions

- Welcome Mat v1 is stable enough to serve as the current canonical discovery/signup shape.
- The current station architecture can tolerate moving registration out of the tutor ritual and into an HTTP enrollment boundary.
- It is acceptable to define a derived station auth profile without claiming that it is literally the same thing as RFC 9449 on HTTP.

## Outstanding Questions

### Deferred to Planning

- [Affects R6,R7][Technical] What is the exact proof envelope for ITP participation after enrollment: fields, binding target, freshness, token reference, and replay strategy?
- [Affects R7][Technical] Which parts of station auth belong at connection/session setup versus every message, and where should optional stronger per-message proof be required?
- [Affects R2,R6][Needs research] Which concrete Welcome Mat artifacts should be preserved verbatim versus profiled or translated for the station implementation?
- [Affects R4,R10][Technical] What exact enrollment success response should hand the agent from HTTP signup into the tutorial space cleanly?
- [Affects R12][Needs research] What is the best terminology for the upstream proposal: “station profile,” “ITP profile,” or a narrower “Welcome Mat extension for intent-space stations”?

## Next Steps

→ /ce:plan for structured implementation planning
