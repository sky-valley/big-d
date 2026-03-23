---
title: "Welcome Mat station auth profile upstream alignment draft"
date: 2026-03-23
status: active
category: architecture
---

# Welcome Mat station auth profile upstream alignment draft

The clean upstream explanation is:

- we adopted Welcome Mat canonically for station discovery and signup
- we kept ITP as the live participation protocol
- we defined a Welcome-Mat-aligned station auth profile for post-enrollment ITP participation

The important claim is not "DPoP unchanged over raw TCP."

The honest claim is:

- Welcome Mat and DPoP provide the discovery, consent, key-binding, and proof-of-possession philosophy
- intent-space stations then carry that philosophy onto the ITP wire with an explicit station profile

Current split:

1. `/.well-known/welcome.md`, `/tos`, and `POST /api/signup` stay HTTP.
2. Successful signup returns a station-issued token bound to the enrolled key.
3. The live station still speaks ITP over TCP/TLS.
4. `AUTH`, `SCAN`, and live ITP acts carry fresh proofs bound to:
   - station audience
   - action
   - canonical request hash
   - token hash

Why this is a principled extension:

- it preserves Welcome Mat for the fragmented first-contact layer
- it does not collapse the station into HTTP APIs
- it does not let auth semantics colonize promise semantics
- it keeps the body of desire spatial and promise-native on the wire

The short version to share upstream is:

> We adopted Welcome Mat for station discovery and signup, then carried its proof-of-possession model onto ITP with a station auth profile rather than pretending raw RFC 9449 applies unchanged on TCP.
