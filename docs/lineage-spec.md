# Argus Lineage Format Specification

**Version:** 0.1.0  
**Status:** Draft  
**Date:** 2026-05-13  
**Reference implementation:** https://github.com/nikhilgupta58/argus (`@argus/lineage`)

---

## Overview

The Argus Lineage Format is a language-agnostic specification for tamper-evident, append-only agent action logs. Each record is content-addressed, cryptographically signed, and chained via parent references. The format is designed to be independently verifiable by any third party holding only the public key.

---

## Event Schema

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string (hex, 64 chars) | Yes | BLAKE3 hash of canonical JSON of all other fields (see Canonical Form) |
| `contract_id` | string | Yes | Identifier of the Outcome Contract this event belongs to |
| `action_kind` | enum (see below) | Yes | Type of action recorded |
| `payload_blake3` | string (hex, 64 chars) | Yes | BLAKE3 hash of action-specific payload (payload itself is out-of-band) |
| `parent_id` | string (hex, 64 chars) \| null | Yes | `null` for genesis event; otherwise `id` of the preceding event |
| `timestamp` | integer | Yes | Unix milliseconds (wall clock, not guaranteed monotonic) |
| `sequence` | integer | Yes | Monotonically increasing per `contract_id`, starting at 0 |

### ActionKind values

| Value | Meaning |
|-------|---------|
| `contract_created` | A new Outcome Contract was activated |
| `contract_updated` | An existing contract was updated |
| `specialist_started` | A specialist agent began executing |
| `specialist_completed` | A specialist agent completed successfully |
| `specialist_failed` | A specialist agent failed |
| `escalation_triggered` | A contract escalation rule fired |
| `budget_exceeded` | The contract budget cap was reached |
| `revert` | A counter-event reversing a previous action (see Revert) |

---

## Signed Event Schema

A Signed Event extends an Event with:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signature` | string (hex, 128 chars) | Yes | Ed25519 signature over canonical JSON of the Event |
| `public_key` | string (hex, 64 chars) | Yes | Ed25519 public key of the signer |

---

## Content Addressing

### BLAKE3 Hash

All content addresses use BLAKE3 (256-bit output). Output is lowercase hex, 64 characters.

### Canonical JSON Form

Before hashing or signing, JSON must be canonicalized:
1. Sort all object keys lexicographically (recursive, including nested objects)
2. No whitespace (compact encoding)
3. UTF-8 encoding

Example: `{"action_kind":"contract_created","contract_id":"my-contract","parent_id":null,"payload_blake3":"aaa...","sequence":0,"timestamp":1700000000000}` (keys sorted, id excluded for the id computation itself).

### Event ID Computation

```
id = BLAKE3(canonical_json({
  contract_id,
  action_kind,
  payload_blake3,
  parent_id,
  timestamp,
  sequence
}))
```

The `id` field is **excluded** from the input to its own hash computation.

---

## Signing

Events are signed with Ed25519 (RFC 8032).

### What is signed

The signature covers the canonical JSON of the full Event (including `id`):

```
signature = Ed25519_sign(
  canonical_json({
    id,
    contract_id,
    action_kind,
    payload_blake3,
    parent_id,
    timestamp,
    sequence
  }),
  private_key
)
```

### Key storage

Private keys should be encrypted at rest. The reference implementation uses:
- PBKDF2-SHA256 for key derivation from passphrase
- XChaCha20-Poly1305 for private key encryption with AAD binding
- Format: `version(4 bytes LE) || pbkdf2_salt(32) || xchacha_nonce(24) || encrypted_key(48)` = 108 bytes
- Version 1: 100,000 PBKDF2 iterations, no AAD (legacy)
- Version 2 (current): 600,000 PBKDF2 iterations, AAD = version(4) + salt(32)

---

## Chain Integrity

A valid lineage chain satisfies:
1. Exactly one event has `parent_id = null` (the genesis event, `sequence = 0`)
2. Every other event has `parent_id = id` of the event with `sequence = this.sequence - 1`
3. Every event's `id` matches its computed BLAKE3 hash
4. Every event's `signature` verifies against its `public_key`

---

## Revert

A revert is a regular signed event with `action_kind = "revert"`. The `payload_blake3` field is the BLAKE3 hash of a JSON object `{"reverts": "<event_id>"}`. Revert events are appended to the chain — they never delete or modify existing events. A chain with a revert event is still valid and fully verifiable.

---

## Independent Verification

Any third party can verify a lineage export by:
1. Obtaining the exported chain (array of Signed Events, JSON or JSON Lines format)
2. Running the chain verification algorithm (checking id hashes, parent linkage, and signatures)
3. No Argus installation required — only BLAKE3 and Ed25519 implementations needed

The reference verifier is in `packages/lineage/src/chain/verify.ts`. It imports only `@noble/curves` and `@noble/hashes`.

---

## Export Format

A lineage export is a JSON array of Signed Event objects, sorted by `sequence` ascending:

```json
[
  { "id": "...", "contract_id": "...", "action_kind": "contract_created", ... },
  { "id": "...", "contract_id": "...", "action_kind": "specialist_started", ... }
]
```

Alternatively, JSON Lines (one JSON object per line) is supported for streaming.
