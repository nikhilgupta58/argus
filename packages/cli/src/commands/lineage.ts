import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  EventStore,
  createRevertEvent,
  decryptKeyPair,
  diffChain,
  replayChain,
  verifyChain,
} from "@argus/lineage";
import { Command } from "commander";
import pc from "picocolors";

const DB_PATH = process.env.ARGUS_DB ?? `${process.env.HOME}/.argus/argus.db`;
const KEYS_DIR = process.env.ARGUS_KEYS_DIR ?? `${process.env.HOME}/.argus/keys`;

function getStore(): EventStore {
  const dir = dirname(resolve(DB_PATH));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return new EventStore(DB_PATH);
}

function loadPrivKey(tenant: string, passphrase: string): Uint8Array {
  const safeTenant = basename(tenant);
  if (!safeTenant || safeTenant !== tenant) {
    throw new Error(`Invalid tenant name: ${tenant}`);
  }
  const path = resolve(KEYS_DIR, `${safeTenant}.key`);
  if (!existsSync(path)) throw new Error(`Key file not found: ${path}`);
  const data = readFileSync(path);
  return decryptKeyPair(data, passphrase).privateKey;
}

export const lineageCommand = new Command("lineage").description("Manage event lineage");

lineageCommand
  .command("replay <contractId>")
  .description("Reconstruct the current state of a contract from its event chain")
  .action((contractId: string) => {
    const store = getStore();
    const chain = store.getChain(contractId);
    store.close();
    if (chain.length === 0) {
      console.error(pc.red(`No events found for contract: ${contractId}`));
      process.exit(1);
    }
    const state = replayChain(chain);
    console.log(pc.bold(`Replay: ${contractId}`));
    console.log(`  events:       ${state.eventCount}`);
    console.log(`  last event:   ${state.lastEventId}`);
    console.log(`  last seq:     ${state.lastSequence}`);
    console.log(`  has revert:   ${state.hasRevert}`);
    console.log("  actions:");
    for (const a of state.appliedActions) {
      console.log(`    - ${a}`);
    }
  });

lineageCommand
  .command("verify <contractId>")
  .description("Verify the signature chain for a contract (standalone — no trust required)")
  .action((contractId: string) => {
    const store = getStore();
    const chain = store.getChain(contractId);
    store.close();
    const result = verifyChain(chain);
    if (result.valid) {
      console.log(pc.green(`✓ Chain valid — ${result.eventCount} events, all signatures verified`));
    } else {
      console.error(pc.red(`✗ Chain invalid — ${result.errors.length} error(s):`));
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }
  });

lineageCommand
  .command("revert <contractId> <eventId>")
  .description("Create a signed counter-event that reverts a specific event (never deletes)")
  .option("--tenant <name>", "Signing key tenant", "default")
  .option("--passphrase <pass>", "Key passphrase (or ARGUS_PASSPHRASE env)")
  .action(
    (contractId: string, targetEventId: string, opts: { tenant: string; passphrase?: string }) => {
      const passphrase = opts.passphrase ?? process.env.ARGUS_PASSPHRASE;
      if (!passphrase) {
        console.error(pc.red("Error: --passphrase required"));
        process.exit(1);
      }
      const store = getStore();
      const target = store.getById(targetEventId);
      const latest = store.getLatest(contractId);
      if (!target) {
        console.error(pc.red(`Event ${targetEventId} not found`));
        store.close();
        process.exit(1);
      }
      if (!latest) {
        console.error(pc.red(`No events for contract ${contractId}`));
        store.close();
        process.exit(1);
      }
      const privKey = loadPrivKey(opts.tenant, passphrase);
      const revert = createRevertEvent(target, latest, privKey);
      store.append(revert);
      store.close();
      console.log(pc.green(`✓ Revert event created: ${revert.id}`));
      console.log(`  reverts: ${targetEventId}`);
      console.log(`  new seq: ${revert.sequence}`);
    },
  );

lineageCommand
  .command("diff <contractId> <fromSeq> <toSeq>")
  .description("Show events added between two sequence numbers")
  .action((contractId: string, fromSeqStr: string, toSeqStr: string) => {
    const fromSeq = Number.parseInt(fromSeqStr, 10);
    const toSeq = Number.parseInt(toSeqStr, 10);
    if (Number.isNaN(fromSeq) || Number.isNaN(toSeq)) {
      console.error(pc.red("Error: fromSeq and toSeq must be integers"));
      process.exit(1);
    }
    const store = getStore();
    const chain = store.getChain(contractId);
    store.close();
    const before = chain.filter((e) => e.sequence <= fromSeq);
    const after = chain.filter((e) => e.sequence <= toSeq);
    const diff = diffChain(before, after);
    console.log(pc.bold(`Diff ${contractId}: seq ${diff.fromSequence} → ${diff.toSequence}`));
    for (const ev of diff.addedEvents) {
      console.log(`  + [seq ${ev.sequence}] ${ev.action_kind} (${ev.id.slice(0, 12)}…)`);
    }
  });
