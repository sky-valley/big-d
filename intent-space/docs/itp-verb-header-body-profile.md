# ITP Verb Header Body Profile

This document defines the Phase 0 protocol addendum for replacing NDJSON as the
live ITP wire framing.

It is intentionally narrow:

- common envelope grammar
- required headers per verb
- scalar header formats and naming
- malformed-envelope conditions
- auth transport-profile doctrine
- canonical proof/hash doctrine
- transcript/debug persistence doctrine

It does not redefine intent-space semantics. It only redefines how the same
acts are framed on the wire.

It does **not** define or constrain the meaning of the body bytes for any act.
Bodies remain opaque payloads at the framing layer.

## 1. Common Envelope Grammar

Every framed ITP message has four parts:

1. a bare verb line
2. zero or more header lines
3. one empty line terminating the header section
4. exactly `body-length` bytes of body

Canonical conceptual shape:

```text
VERB
header-name: value
header-name: value
body-length: <decimal-bytes>

<opaque body bytes>
```

### 1.1 Verb Line

- line 1 is the bare verb only
- examples:
  - `INTENT`
  - `PROMISE`
  - `SCAN`
  - `AUTH_RESULT`

The verb line does not carry inline parameters or protocol version text.

### 1.2 Header Lines

Headers use:

```text
name: value
```

Rules:

- header names are lowercase ASCII only
- duplicate headers are forbidden
- unknown headers are allowed and must be preserved
- header order is not semantically meaningful
- receivers may normalize header ordering internally for canonical hashing
- per-verb required header names are authoritative; implementations must not
  invent alternate spellings such as `promise-id` for `promise` or `space-id`
  for `space`

### 1.2.1 Header Name to Semantic Field Mapping

The wire profile uses short lowercase header names. Implementations may project
those values into local object fields, but that projection is not the wire
format itself.

Common examples:

- `sender` → local field such as `senderId`
- `intent` → local field such as `intentId`
- `promise` → local field such as `promiseId`
- `space` → local field such as `spaceId`

The authoritative wire name is always the lowercase header name defined in this
document.

### 1.3 Header Section Terminator

The header section ends with one empty line.

In canonical LF form, this means the headers are followed by `\n\n`.

The empty line separates headers from the body. It does **not** determine body
length.

### 1.4 Body Framing

`body-length` is universally required on every message.

Rules:

- `body-length` is the authoritative body framing mechanism
- it is the decimal number of bytes that follow the header terminator
- the body is opaque replayable bytes
- the body may carry any content
- the protocol does not require JSON structure for the body

Optional interpretation metadata:

- `payload-hint` may be present as advisory interpretation metadata
- `payload-hint` does not create a mandatory universal schema contract

### 1.4.1 Scalar Header Formats

Unless a verb-specific rule says otherwise:

- identifiers such as `sender`, `intent`, `promise`, `parent`, `space`, and
  `principal` are opaque strings
- `body-length` is a base-10 non-negative integer byte count
- `timestamp` is a base-10 integer expressing Unix epoch milliseconds
- `since` is a base-10 non-negative integer sequence cursor
- `latest-seq` is a base-10 non-negative integer sequence cursor

### 1.5 Universal Header Requirement

Only one header is universally required on all framed messages:

- `body-length`

All other required headers are defined per verb.

### 1.6 Malformed Envelope Conditions

A framed ITP message is malformed at the envelope layer if any of the following
are true:

- the verb line is missing or empty
- a header line is missing the `: ` separator
- a header name contains characters outside lowercase ASCII plus `-`
- the same header name appears more than once
- the required empty line separating headers from the body is missing
- `body-length` is missing
- `body-length` is not a base-10 non-negative integer
- the actual body byte count does not match `body-length`
- a required header for the given verb is missing
- a scalar header declared numeric in this document is not parseable as the
  required integer form

This section only defines malformed framing and envelope incompleteness. It
does not define the social or implementation-level response to a semantically
invalid act whose envelope is otherwise well formed.

## 2. Required Headers Per Verb

These required headers preserve current semantics while moving the current
JSON payload into an opaque body.

### 2.1 Stored Participant Acts

#### `INTENT`

Required:

- `sender`
- `parent`
- `intent`
- `timestamp`
- `body-length`

Header notes:

- `timestamp` is Unix epoch milliseconds

#### `PROMISE`

Required:

- `sender`
- `parent`
- `intent`
- `promise`
- `timestamp`
- `body-length`

Header notes:

- `timestamp` is Unix epoch milliseconds

#### `DECLINE`

Required:

- `sender`
- `parent`
- `intent`
- `timestamp`
- `body-length`

`DECLINE` remains intent-scoped rather than promise-scoped.

Header notes:

- `timestamp` is Unix epoch milliseconds

#### `ACCEPT`

Required:

- `sender`
- `parent`
- `promise`
- `timestamp`
- `body-length`

Header notes:

- `promise` is the required promise identifier on the wire
- `timestamp` is Unix epoch milliseconds

#### `COMPLETE`

Required:

- `sender`
- `parent`
- `promise`
- `timestamp`
- `body-length`

Header notes:

- `timestamp` is Unix epoch milliseconds

#### `ASSESS`

Required:

- `sender`
- `parent`
- `promise`
- `timestamp`
- `body-length`

Header notes:

- `timestamp` is Unix epoch milliseconds

### 2.2 Station Read Path

#### `SCAN`

Required:

- `space`
- `since`
- `body-length`

Notes:

- `SCAN` remains a private query, not a stored participant act
- sender identity remains bound through the authenticated session/proof context,
  not a `sender` request header
- `space` is the wire header name; not `space-id`
- `since` is required even when the caller wants the full visible history
  (use `0`)

#### `SCAN_RESULT`

Required:

- `space`
- `latest-seq`
- `body-length`

The body carries the returned message batch.

Header notes:

- `space` is the wire header name for the queried containment scope
- `latest-seq` is the latest visible sequence number in that scope

### 2.3 Auth Path

Auth is a special transport-profile case. It does **not** need identical
surface expression on every carrier, but it must reuse the same underlying
materials and semantics.

#### `AUTH`

Pure TCP / ITP profile requires:

- `station-token`
- `proof`
- `body-length`

This preserves the current station-auth expression on the ITP wire.

#### `AUTH_RESULT`

Required:

- `sender`
- `principal`
- `body-length`

Optional:

- `space`

### 2.4 Error Path

#### `ERROR`

Required:

- `body-length`

The body carries the human-readable error description.

This preserves the current simple error model without inventing a separate code
taxonomy in Phase 0.

## 3. Auth Transport-Profile Doctrine

Interchangeability means shared auth materials and shared auth semantics. It
does **not** require byte-identical auth framing across all carriers.

### 3.1 Shared Auth Materials

Across carriers, the following remain the same conceptual materials:

- agent keypair
- station-issued token continuity
- audience binding
- proof-of-possession claims

### 3.2 HTTP Profile

When speaking HTTP to an intent-space deployment, adopt the existing Welcome
Mat / DPoP work.

That profile remains the canonical HTTP-facing auth expression.

### 3.3 Pure TCP Profile

When speaking pure TCP / ITP, retain the current station-auth expression on the
ITP wire:

- explicit `AUTH`
- station token
- proof material
- per-message proof continuation on later acts

### 3.4 Continuity Rule

Switching carriers mid-session should reuse the same underlying auth assets
where possible.

The system should not invent a second unrelated auth model merely because the
transport changed.

## 4. Canonical Proof / Hash Doctrine

Phase 0 pins the doctrine, not yet the final byte-level implementation text.

Required doctrine:

- proof binding remains explicit and transport-aware
- canonical hashing must be defined over the new framed message representation,
  not JSON object canonicalization
- the rule must specify:
  - which headers participate
  - how headers are normalized
  - whether body bytes are hashed directly or via digest
  - how HTTP and TCP profiles reuse the same semantic proof materials

Implementation may not invent this piecemeal in auth code.

## 5. Transcript / Debug Persistence Doctrine

Opaque bodies must remain preservable and replayable even when not interpreted.

Phase 0 doctrine:

- transcripts must preserve enough information to replay the exact framed act
- local debug surfaces may use:
  - raw stored bytes
  - encoded body forms
  - sidecar body files
- the chosen representation must work for:
  - natural-language bodies
  - large bodies
  - binary bodies

Human readability is secondary to honest preservation and replay.

## 6. Transport Rule

Ordinary ITP acts use the same framed message model across carriers.

So:

- over TCP, the framed ITP message is the payload on the stream
- over HTTP, the framed ITP message is the body carried by HTTP

HTTP remains a carrier, not the conceptual model of the protocol.
