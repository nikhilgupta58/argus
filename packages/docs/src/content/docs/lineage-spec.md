---
title: Lineage Format Specification
description: How Argus records tamper-evident, signed agent action logs.
---

The Argus Lineage Format is a language-agnostic specification for tamper-evident, append-only agent action logs. The reference implementation is `@argus/lineage`. The full machine-readable spec is at [`docs/lineage-spec.md`](https://github.com/nikhilgupta58/argus/blob/main/docs/lineage-spec.md) in the repository.

## Event Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (hex 64) | `BLAKE3(canonical JSON of all other fields)` |
| `contract_id` | string | The contract this event belongs to |
| `action_kind` | enum | Type of action (see below) |
| `payload_blake3` | string (hex 64) | `BLAKE3(action payload)` |
| `parent_id` | string \| null | `null` for genesis; otherwise `id` of preceding event |
| `timestamp` | integer | Unix milliseconds |
| `sequence` | integer | Monotonically increasing per `contract_id`, starting at 0 |
| `signature` | string (hex) | Ed25519 signature over canonical JSON (including `id`) |

## Action Kinds

| Value | Description |
|-------|-------------|
| `contract_created` | Contract first registered |
| `contract_updated` | New contract version stored |
| `specialist_started` | Orchestrator began a specialist run |
| `specialist_completed` | Specialist finished successfully |
| `specialist_failed` | Specialist returned an error |
| `budget_exceeded` | Budget hard cap hit |
| `escalation_triggered` | Escalation rule fired |
| `revert` | Logical undo of a prior event (never deletes) |

## Tamper Evidence

Events form a hash chain: `event.parent_id == prior_event.id`. Breaking any link causes `argus lineage verify` to fail. Signatures are verified independently per event.

## Independent Verification

The chain verifier (`verifyChain()`) imports only `@noble/curves` and `@noble/hashes` — zero Argus runtime dependencies. Any third party holding the public key can verify the chain without trusting the Argus runtime.

## CLI Commands

```bash
argus lineage replay <contractId>
argus lineage verify <contractId>
argus lineage revert <contractId> <eventId>
argus lineage diff <contractId> <fromSeq> <toSeq>
```
