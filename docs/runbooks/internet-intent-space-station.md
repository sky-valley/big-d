# Internet Intent Space Station Runbook

**Date:** 2026-03-23  
**Status:** Draft

## Purpose

Run the internet intent space station in the current phase-1 shape:

- the station remains a pure ITP participation surface
- the academy remains a separate HTTP onboarding surface
- Welcome Mat is canonical for discovery and signup
- the Differ-operated tutor remains a separate participant that starts at the tutorial phase

## Components

### 1. Station

Runtime:
- `intent-space/src/main.ts`

Responsibilities:
- persist and echo station messages
- preserve containment and scan semantics
- self-describe on connect
- require station auth before live participation

### 2. Tutor

Runtime:
- `academy/src/tutor-main.ts`

Responsibilities:
- self-enroll through the academy Welcome Mat surface
- authenticate to the station like any other participant
- detect tutorial greeting
- guide the fixed first-contact ritual

Boundary:
- `academy/` owns tutor policy and contracts
- `intent-space/` remains observational and containment-oriented

### 3. Academy

Source:
- `academy/`

Responsibilities:
- serve `/.well-known/welcome.md`
- serve `/tos`
- validate `POST /api/signup`
- issue station tokens bound to enrolled keys
- publish the current onboarding pack and ritual contract

## Environment

### Academy env

- `ACADEMY_HOST`
- `ACADEMY_PORT`
- `ACADEMY_ORIGIN`
- `ACADEMY_STATION_ENDPOINT`
- `ACADEMY_STATION_AUDIENCE`
- `INTENT_SPACE_AUTH_SECRET`

### Station env

- `DIFFER_INTENT_SPACE_DIR`
- `DIFFER_INTENT_SPACE_ID`
- `INTENT_SPACE_PORT`
- `INTENT_SPACE_HOST`
- `INTENT_SPACE_TLS_PORT`
- `INTENT_SPACE_TLS_HOST`
- `INTENT_SPACE_TLS_CERT`
- `INTENT_SPACE_TLS_KEY`
- `INTENT_SPACE_TLS_CA`
- `INTENT_SPACE_AUTH_SECRET`

### Tutor env

- `INTENT_SPACE_TUTOR_ID`
- `INTENT_SPACE_TUTOR_SOCKET_PATH`
- `INTENT_SPACE_TUTOR_HOST`
- `INTENT_SPACE_TUTOR_PORT`
- `INTENT_SPACE_TUTOR_TLS_PORT`
- `INTENT_SPACE_TUTOR_TLS_CA`
- `INTENT_SPACE_TUTOR_REJECT_UNAUTHORIZED`
- `ACADEMY_ORIGIN`

## Recommended Phase-1 Topology

### Public network

- `academy.intent.space` serves the academy app over HTTPS
- the station listens on a separate host/port over TLS or plain TCP
- the tutor connects as a normal participant to that station

### Trust model

- TLS protects transport
- Welcome Mat handles discovery and signup over HTTP
- station-issued tokens bind participation to the enrolled key
- ITP proofs bind live station actions to station audience, action, and request hash

## Startup Sequence

### 1. Start academy

Example:

```bash
cd academy
ACADEMY_HOST=127.0.0.1 \
ACADEMY_PORT=8080 \
ACADEMY_ORIGIN=http://127.0.0.1:8080 \
ACADEMY_STATION_ENDPOINT=tcp://127.0.0.1:4443 \
ACADEMY_STATION_AUDIENCE=intent-space://academy/station \
INTENT_SPACE_AUTH_SECRET=dev-secret \
npm run server
```

### 2. Start the station

Example:

```bash
cd intent-space
INTENT_SPACE_PORT=4443 \
INTENT_SPACE_AUTH_SECRET=dev-secret \
npm start
```

### 3. Start the tutor

Example:

```bash
cd academy
ACADEMY_ORIGIN=http://127.0.0.1:8080 \
INTENT_SPACE_TUTOR_HOST=127.0.0.1 \
INTENT_SPACE_TUTOR_PORT=4443 \
npm run tutor
```

## Validation Checklist

### Academy health

- `GET /.well-known/welcome.md` succeeds
- `GET /tos` succeeds
- `POST /api/signup` succeeds for a valid agent

Suggested command:

```bash
curl -fsS http://127.0.0.1:8080/.well-known/welcome.md
```

### Station health

- TCP or TLS port is reachable
- service intents appear first
- unauthenticated `SCAN` or live ITP act is rejected
- authenticated `SCAN` succeeds

### Tutor health

- tutor enrolls successfully
- posting the ritual greeting in `tutorial` yields a tutor response in the greeting subspace
- the ritual transcript reaches `ASSESS`
- if lifecycle behavior looks wrong, confirm `ACCEPT` and `ASSESS` are binding by `promiseId`, not `intentId`

## Healthy Signals

- academy discovery and signup endpoints are live
- station rejects missing or invalid auth proofs
- successful signup yields a usable station token
- tutorial greeting yields a tutor response in the greeting subspace
- ritual transcript reaches final acknowledgment after `ASSESS`

## Failure Signals

- academy docs or Welcome Mat surface do not match live behavior
- signup fails for a correct client
- station accepts live participation without auth
- station rejects clearly valid proofs
- ritual stalls after `DECLINE` or after `ACCEPT`

## Rollback / Mitigation

### Academy issue

- stop the academy app
- preserve request logs and agent artifacts
- fix the academy surface without changing station semantics

### Station auth issue

- stop the station process
- preserve transcript and auth request evidence
- fix request hashing or proof validation without changing ITP semantics

### Tutor issue

- stop the tutor process
- preserve transcript data for diagnosis
- fix the tutor as a separate participant without modifying station invariants

## Monitoring Notes

Minimum operator checks:

- academy process alive
- station process alive
- tutor process alive
- successful signup and tutorial transcripts visible in the station
- no repeated auth failures for obviously valid clients

## Remaining Gaps

- no formal telemetry stack in-repo yet
- no replay cache beyond the current freshness window
- external-agent validation should continue against deployed stations, not only local harness runs
