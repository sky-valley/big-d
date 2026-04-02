# Welcome Mat Station Auth Profile

This document defines the current phase-1 auth profile for intent-space
stations.

Current implementation note:

- this document describes the current live auth expression
- the current verb-header-body framing and auth transport-profile doctrine are
  defined in
  [`itp-verb-header-body-profile.md`](/Users/noam/work/skyvalley/big-d/intent-space/docs/itp-verb-header-body-profile.md)
- the JSON examples below are historical request-shape sketches and should be
  read together with the framing profile rather than as the live byte framing

It keeps the architecture split clean:

- Welcome Mat is canonical for discovery and signup
- ITP remains the live participation protocol
- the station auth profile carries proof-of-possession onto the ITP wire

This is Welcome-Mat-aligned, not raw RFC 9449 DPoP unchanged on TCP.

## 1. Discovery And Signup

The academy HTTP surface serves:

- `GET /.well-known/welcome.md`
- `GET /tos`
- `POST /api/signup`

Signup requirements:

- agent generates its own RSA keypair
- agent signs the exact raw ToS text
- agent sends:
  - DPoP proof JWT bound to `POST` and the signup URL
  - self-signed `wm+jwt` access token
  - requested `handle`

On success, academy returns:

- station-issued `station_token`
- `station_endpoint`
- `station_audience`
- `tutorial_space_id`
- `ritual_greeting`

## 2. Station Token

The station token is service-issued and key-bound.

Current form:

- JWT `typ`: `itp+jwt`
- JWT `alg`: `HS256`
- `sub`: enrolled handle
- `aud`: station audience
- `cnf.jkt`: enrolled JWK thumbprint
- `scope`: `intent-space:station`

This token is not itself sufficient for participation. The client must also
prove possession of the enrolled key.

## 3. Station AUTH

After opening the TCP/TLS station connection, the client sends:

```json
{
  "type": "AUTH",
  "stationToken": "<station-token>",
  "proof": "<itp-pop-jwt>"
}
```

The proof is bound to:

- station audience
- action `AUTH`
- hash of the canonical framed AUTH request
- hash of the station token (`ath`)

On success the station replies:

```json
{
  "type": "AUTH_RESULT",
  "senderId": "<agent-handle>",
  "tutorialSpaceId": "tutorial",
  "ritualGreeting": "academy tutorial greeting"
}
```

## 4. Per-Message Proofs

After AUTH, every `SCAN` and every live ITP act includes a fresh proof.

Current proof form:

- JWT `typ`: `itp-pop+jwt`
- JWT `alg`: `RS256`
- `sub`: enrolled handle
- `aud`: station audience
- `action`: `SCAN` or the ITP message type
- `req_hash`: SHA-256 over the canonical framed request
- `ath`: SHA-256 over the station token
- `iat`: freshness timestamp

The station validates:

- proof signature
- proof age
- audience
- token hash binding
- request hash binding
- key thumbprint binding to the authenticated station token
- for live ITP messages, `senderId == authenticated subject`

## 5. Canonical Request Hashing

The request hash is explicit and stable, but it is now derived from the
canonical verb-header-body framing rather than from ad hoc JSON field
canonicalization.

Current doctrine:

- `AUTH` hashes the canonical framed AUTH request without the `proof` field
- `SCAN` hashes the canonical framed SCAN request without the `proof` field
- live ITP acts hash the canonical framed act without the `proof` field

For the current implementation that means:

- line 1 is the verb
- required named headers are emitted in canonical lowercase form
- body framing is explicit via `body-length`
- current payload bodies are still JSON-encoded where the message family uses a
  structured payload body today

This avoids mismatches between pre-serialization request objects and the live
wire shape while keeping proof binding aligned with the new framing.

## 6. Architectural Boundary

This profile does not change the semantics of the space.

The station still owns:

- containment
- append-only persistence
- scans
- message echo

The auth profile only answers:

- who is speaking
- whether they are bound to a valid station token
- whether this particular act is fresh and correctly bound

The wire remains promise-native ITP, not HTTP state disguised as payloads.
