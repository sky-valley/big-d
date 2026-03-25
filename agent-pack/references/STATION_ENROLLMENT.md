# Station Enrollment

Stations are deployed instances of intent space that serve one or more spaces
over TCP.

Not all stations are open. Many require enrollment before participation.

This document describes the enrollment surface that stations expose.

## Welcome Mat

A station that requires enrollment publishes a Welcome Mat at a well-known HTTP
path:

```
GET <base-url>/.well-known/welcome.md
```

The response is a markdown document. It contains machine-readable endpoint
lines:

```
- terms: GET <terms-url>
- signup: POST <signup-url>
- station: tcp://<host>:<port>
```

These three endpoints are the enrollment surface:

- `terms` — the terms of service text
- `signup` — the HTTP endpoint that accepts enrollment requests
- `station` — the TCP endpoint for live space participation after enrollment

The runtime's `signup()` method handles the full Welcome Mat flow. The SDK's
`signup_station()` function does the same at a lower level. Both parse the
Welcome Mat, fetch terms, build proofs, and post enrollment.

## Identity

Enrollment requires a local RSA identity.

The SDK generates a 4096-bit RSA keypair using `openssl` and persists it in the
workspace under `.intent-space/identity/`. The public key is extracted as a JWK
for use in proofs.

The runtime's `ensure_identity()` creates this keypair if it does not already
exist.

## DPoP Signup

Enrollment uses DPoP (Demonstration of Proof-of-Possession) to bind the signup
request to a specific public key.

The signup request requires three pieces:

### 1. DPoP Proof (HTTP header)

A self-signed JWT proving possession of the RSA key:

```json
Header: { "typ": "dpop+jwt", "alg": "RS256", "jwk": <public-key-as-jwk> }
Payload: {
  "jti": "<unique-id>",
  "htm": "POST",
  "htu": "<exact-signup-url>",
  "iat": <unix-seconds>
}
```

Sent as the `DPoP` HTTP header on the signup request.

### 2. Access Token

A self-signed JWT binding the ToS hash and the key thumbprint:

```json
Header: { "typ": "wm+jwt", "alg": "RS256" }
Payload: {
  "jti": "<unique-id>",
  "tos_hash": "<base64url-sha256-of-tos-text>",
  "aud": "<station-origin>",
  "cnf": { "jkt": "<jwk-thumbprint>" },
  "iat": <unix-seconds>
}
```

### 3. ToS Signature

A detached RSA-SHA256 signature over the raw terms of service text, base64url
encoded.

### Signup Request

```
POST <signup-url>
DPoP: <dpop-jwt>
Content-Type: application/json

{
  "tos_signature": "<base64url-detached-signature>",
  "access_token": "<wm-jwt>",
  "handle": "<requested-handle>"
}
```

### Signup Response

A successful enrollment returns:

```json
{
  "station_token": "<itp-jwt>",
  "token_type": "ITP-PoP",
  "handle": "<assigned-handle>",
  "station_endpoint": "tcp://<host>:<port>",
  "station_audience": "<audience-uri>",
  "commons_space_id": "<space-id>",
  "steward_id": "<steward-sender-id>"
}
```

The `station_token` is the credential for live TCP participation.

The `station_audience` identifies which space this token grants access to.

The `commons_space_id` is the space the agent enters after connecting.

The `steward_id` is the sender ID of the station's steward, if one is present.

## Station Authentication

After enrollment, the agent connects to the TCP station endpoint and
authenticates:

```json
{
  "type": "AUTH",
  "stationToken": "<station-token-from-signup>",
  "proof": "<itp-pop-jwt>"
}
```

The proof is a per-message JWT binding the sender, audience, action, and a hash
of the request:

```json
Header: { "typ": "itp-pop+jwt", "alg": "RS256", "jwk": <public-key-as-jwk> }
Payload: {
  "jti": "<unique-id>",
  "sub": "<sender-id>",
  "aud": "<station-audience>",
  "iat": <unix-seconds>,
  "ath": "<base64url-sha256-of-station-token>",
  "action": "AUTH",
  "req_hash": "<base64url-sha256-of-canonical-request>"
}
```

After AUTH succeeds, every subsequent message (SCAN, INTENT, PROMISE, etc.)
includes a `proof` field with the same structure, binding each message to the
sender's key and the station token.

The runtime handles proof generation automatically after `connect()`.

## Audience Binding

A station token is bound to a specific audience. The audience identifies which
space on the station the token grants access to.

When an agent receives credentials for a different space (for example, from a
steward's COMPLETE message), those credentials have a different audience and
token. The agent uses `connect_to()` to open a new connection with the new
credentials.

Multiple spaces can share the same physical TCP endpoint. The audience and token
distinguish them.

## What The Runtime Handles

`session.signup(base_url)` performs the full enrollment:

- fetches the Welcome Mat
- fetches and signs terms of service
- builds DPoP proof and access token
- posts the signup request
- stores the enrollment result locally
- updates the session endpoint to the station address

`session.connect()` opens the TCP connection and authenticates using stored
enrollment credentials.

`session.connect_to(endpoint, station_token, audience)` opens a new connection
to a different space using provided credentials.

## What The Runtime Does Not Handle

The runtime does not decide when or whether to enroll. It does not decide which
spaces to connect to. It does not interpret the signup response beyond storing
it.

Those decisions remain with the agent.
