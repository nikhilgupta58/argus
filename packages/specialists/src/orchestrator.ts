import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import { ContractStore } from "@argus/core";
import { EventStore, signEvent, eventId } from "@argus/lineage";
import type { Event } from "@argus/lineage";
import { SpecialistRegistry } from "./registry.js";
import { BunSandbox } from "./sandbox.js";
import type { SpecialistContext, SpecialistOutput, SpecialistError } from "./types.js";
import type { Result } from "@argus/core";

const encoder = new TextEncoder();

function payloadHash(payload: unknown): string {
  return bytesToHex(blake3(encoder.encode(JSON.stringify(payload))));
}

export class Orchestrator {
  constructor(
    private contractStore: ContractStore,
    private eventStore: EventStore,
    private registry: SpecialistRegistry,
    private sandbox: BunSandbox,
    private privateKey: Uint8Array,
  ) {}

  async run(
    contractId: string,
    invocationId: string,
  ): Promise<Result<SpecialistOutput, SpecialistError>> {
    // Load latest version of the contract
    const contract = this.contractStore.loadLatest(contractId);
    if (!contract) {
      return {
        ok: false,
        error: { code: "INVALID_CONTRACT", message: `Contract not found: ${contractId}` },
      };
    }

    // Find specialist by kind
    const manifests = this.registry.findByKind(contract.kind);
    if (manifests.length === 0) {
      return {
        ok: false,
        error: {
          code: "INVALID_CONTRACT",
          message: `No specialist registered for kind: ${contract.kind}`,
        },
      };
    }
    const manifest = manifests[0];

    // Ensure genesis event exists; if not, emit contract_created
    let latest = this.eventStore.getLatest(contractId);
    if (!latest) {
      const genesisPayload = { contractId, version: contract.version };
      const genesisBase: Omit<Event, "id"> = {
        contract_id: contractId,
        action_kind: "contract_created",
        payload_blake3: payloadHash(genesisPayload),
        parent_id: null,
        timestamp: Date.now(),
        sequence: 0,
      };
      const genesis = signEvent({ ...genesisBase, id: eventId(genesisBase) }, this.privateKey);
      this.eventStore.append(genesis);
      latest = genesis;
    }

    // Emit specialist_started
    const startedPayload = {
      invocationId,
      specialistName: manifest.name,
      specialistVersion: manifest.version,
      manifestHash: manifest.manifestHash,
    };
    const startedBase: Omit<Event, "id"> = {
      contract_id: contractId,
      action_kind: "specialist_started",
      payload_blake3: payloadHash(startedPayload),
      parent_id: latest.id,
      timestamp: Date.now(),
      sequence: latest.sequence + 1,
    };
    const startedEvent = signEvent({ ...startedBase, id: eventId(startedBase) }, this.privateKey);
    this.eventStore.append(startedEvent);

    // Build specialist context and run
    const ctx: SpecialistContext = {
      contractId,
      contractKind: contract.kind,
      contract,
      invocationId,
      budgetRemaining: { tokens: contract.budget?.tokens, usd: contract.budget?.usd },
    };

    const result = await this.sandbox.run(manifest.entrypoint, ctx);

    // Fetch the latest event again (specialist may have appended its own events)
    const postLatest = this.eventStore.getLatest(contractId)!;

    if (result.ok) {
      const completedPayload = {
        invocationId,
        summary: result.value.summary,
        tokensUsed: result.value.tokensUsed,
        usdUsed: result.value.usdUsed,
      };
      const completedBase: Omit<Event, "id"> = {
        contract_id: contractId,
        action_kind: "specialist_completed",
        payload_blake3: payloadHash(completedPayload),
        parent_id: postLatest.id,
        timestamp: Date.now(),
        sequence: postLatest.sequence + 1,
      };
      this.eventStore.append(
        signEvent({ ...completedBase, id: eventId(completedBase) }, this.privateKey),
      );
    } else if (result.error.code === "BUDGET_EXCEEDED") {
      const exceededPayload = { invocationId, message: result.error.message };
      const exceededBase: Omit<Event, "id"> = {
        contract_id: contractId,
        action_kind: "budget_exceeded",
        payload_blake3: payloadHash(exceededPayload),
        parent_id: postLatest.id,
        timestamp: Date.now(),
        sequence: postLatest.sequence + 1,
      };
      this.eventStore.append(
        signEvent({ ...exceededBase, id: eventId(exceededBase) }, this.privateKey),
      );
    } else {
      const failedPayload = {
        invocationId,
        errorCode: result.error.code,
        message: result.error.message,
      };
      const failedBase: Omit<Event, "id"> = {
        contract_id: contractId,
        action_kind: "specialist_failed",
        payload_blake3: payloadHash(failedPayload),
        parent_id: postLatest.id,
        timestamp: Date.now(),
        sequence: postLatest.sequence + 1,
      };
      this.eventStore.append(
        signEvent({ ...failedBase, id: eventId(failedBase) }, this.privateKey),
      );
    }

    return result;
  }
}
