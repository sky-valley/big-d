---
date: 2026-04-06
topic: fix-spacebase1-signup-body-discoverability
---

# Plan: Fix Spacebase1 Signup Body Discoverability

## Goal

Make the `spacebase1` HTTP signup surface cold-startable from the welcome
document alone, without requiring an implementer to read the marketplace SDK to
discover the request body shape.

The fix should preserve the current Welcome Mat + DPoP auth model and only
improve:

- contract discoverability in `welcome.md`
- validation feedback when signup bodies are malformed

## Problem

Cold-start agents can currently discover:

- the protocol family
- the relevant endpoints
- the DPoP algorithm and key-size requirements

But they cannot discover the required `POST /signup` JSON body shape from the
welcome document itself.

Today both `/commons/signup` and claim-space `/signup` collapse malformed bodies
into:

- `{"error":"invalid_signup_body"}`

That leaves a standards-minded implementer with no clear path to recover
without reading the marketplace SDK.

## Intended Outcome

An external implementer should be able to:

1. Read `/.well-known/welcome.md`
2. Construct the signup body correctly on the first try
3. If they get it wrong, receive a structured validation error that points to
   the exact missing or invalid field
4. Complete signup without consulting source code

## Scope

In scope:

- commons welcome doc
- claim-surface welcome doc
- signup body validation and error responses for both signup handlers
- tests for documentation presence and structured validation behavior

Out of scope:

- changing the auth chain itself
- changing DPoP or welcome-mat token semantics
- changing the provisioning lifecycle
- changing station-token/session semantics
- changing the pack docs as the primary fix

## Plan

### Phase 1: Make the signup contract explicit in welcome.md

Update the generated welcome markdown so it includes a dedicated `## signup body`
section for both commons and claim surfaces.

That section should state:

- content type: JSON
- required fields:
  - `handle` — string; participant handle, normalized to the station format
  - `access_token` — string; Welcome Mat access token JWT (`wm+jwt`)
  - `tos_signature` — string; detached RS256 signature over the current terms
- what each field represents at a high level
- a minimal example body

This should stay contract-level, not SDK-level:

- no pack-specific helper names
- no Python snippets required in the welcome doc

### Phase 2: Replace opaque body errors with structured validation errors

Introduce a signup-body validator that distinguishes:

- malformed JSON body vs non-object
- missing field
- wrong type
- present-but-empty string if applicable

Return structured errors such as:

- `{"error":"missing_field","field":"tos_signature"}`
- `{"error":"invalid_field_type","field":"access_token","expected":"string"}`
- `{"error":"invalid_signup_body","reason":"expected_json_object"}`

Apply this consistently to:

- `/commons/signup`
- `/claim/:space/:token/signup`

Do not leak cryptographic internals here. Once the body shape is valid, deeper
auth failures can continue to return semantic auth-validation messages from
`validateClaimSignup(...)`.

### Phase 3: Add regression coverage

Add tests that lock in:

- welcome markdown contains the signup body section
- welcome markdown names all three required fields
- commons signup returns field-specific validation errors
- claim signup returns field-specific validation errors
- valid body flow still works unchanged

### Phase 4: Live cold-start verification

Run one real cold-start validation pass against local `spacebase1`:

- use only the welcome doc for contract discovery
- do not inspect SDK source
- confirm a minimal raw HTTP implementation can construct signup correctly
- confirm malformed body attempts return structured errors that are actually
  useful

## Success Criteria

- An implementer can learn the signup body contract from `welcome.md` alone
- Missing required fields yield structured field-specific errors
- The existing auth flow and successful signup path remain unchanged
- No new SDK dependency is introduced into the documentation contract

## Promise-Native Architecture Check

- **Autonomous participants:** arriving agent, commons steward, claim-space
  steward, hosted station
- **Promises about self:** unchanged; this work does not alter who promises what
  or when
- **State authority:** unchanged; signup validation remains station-side, while
  promise lifecycle authority remains outside the intent space
- **Lifecycle acts required and why:** unchanged; this fix is pre-participation
  onboarding clarity, not a lifecycle redesign
- **Intent-space purity:** preserved; we are clarifying the HTTP signup contract,
  not moving promise semantics into HTTP docs or replacing ITP behavior
- **Visibility / containment:** unchanged; only welcome docs and signup error
  responses are affected
- **Rejected shortcut:** “fix it in the pack docs only.” Rejected because the
  hosted surface itself must be self-describing for cold-start implementers

## Checklist Review

- [x] The plan names the autonomous participants explicitly
- [x] The plan states where authority lives
- [x] The plan says the promise lifecycle is unchanged by this work
- [x] The plan keeps visibility and containment unchanged
- [x] The plan includes a `## Promise-Native Architecture Check` section
- [x] The plan names a rejected shortcut

## Next Step

→ `/ce:work` on this plan
