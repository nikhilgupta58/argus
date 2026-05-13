# Argus Threat Model v0.1

**Status:** living document | **Last updated:** May 2026

---

## Overview

Argus is a local-first CLI tool for AI agents that own outcomes via cryptographically-signed Outcome Contracts. Its attack surface has four main components:

- **CLI (`argus`)** — the local binary that manages contracts, lineage, and specialist installs. Runs with the user's OS permissions and holds access to signing keys and API keys.
- **Contract DSL** — structured YAML/JSON files describing what an agent is allowed to do, the budget it can spend, and the outcome it must produce.
- **Lineage Ledger** — a local SQLite database of Ed25519-signed, BLAKE3 content-addressed event records. Intended to be tamper-evident and third-party verifiable.
- **Specialist Bundles** — agent plugins downloaded from the Argus marketplace, written by arbitrary third-party authors, and executed as subprocesses by the CLI.

The system has no mandatory cloud dependency. All signing keys and API keys live on the developer's machine. This makes local-machine compromise a particularly meaningful threat vector: there is no cloud-side revocation authority or secret escrow to fall back on.

---

## Adversary 1: Malicious Skill Author

**Profile:** A threat actor who publishes a specialist bundle to the Argus marketplace with malicious intent. Motivations include data exfiltration, prompt injection, credential theft, supply chain compromise, or budget draining. The attacker can be anonymous on the internet but must have a GitHub account to publish (see mitigations).

### STRIDE Analysis

| Threat | Scenario |
|--------|----------|
| **Spoofing** | Attacker registers a publisher identity that closely resembles a legitimate, trusted publisher (typosquatting on display name or package name). User installs `argus-specialist-openai-utils` instead of `argus-specialist-openai-util`. |
| **Tampering** | After a bundle passes review and is installed by users, the attacker modifies the hosted artifact. Users who installed it already have the malicious version; users who install later get a different binary. |
| **Repudiation** | Attacker claims their GitHub account was compromised and denies publishing the malicious bundle. Without a certificate transparency log, this is difficult to disprove. |
| **Information Disclosure** | Specialist reads `process.env` to exfiltrate `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or other secrets in the environment. Alternatively, it reads the contract file to extract budget limits and tool permissions, then relays them to an attacker-controlled endpoint. |
| **Denial of Service** | Specialist intentionally loops or makes unbounded LLM calls, consuming the user's entire token budget or API spend before the contract terminates it. |
| **Elevation of Privilege** | Specialist escapes its Bun subprocess sandbox — e.g., via a native Node addon — and gains full access to the host filesystem and network. |

### Planned Mitigations

- **No anonymous publishing.** Publishers must authenticate via Sigstore/OIDC backed by a GitHub identity. The Sigstore certificate transparency log captures the GitHub account at publish time. If a malicious bundle is later discovered, the publisher's identity is permanently recorded and non-repudiable.
- **Ed25519 bundle signing.** Every specialist bundle is signed by the publisher's Ed25519 key at publish time. The CLI verifies the signature on install. A bundle whose bytes have changed since signing will fail verification and be rejected.
- **Content-addressed installs.** Bundles are referenced by BLAKE3 hash in the contract. The same hash always maps to the same code. An attacker cannot silently swap bundle content without changing the hash — which would break all existing contracts referencing the old hash.
- **Revocation list.** A revocation list is checked before every install. When a malicious bundle is reported, its hash and publisher key are added to the list. Existing installs are flagged on next run; new installs are blocked.
- **Budget enforcement (Phase 3).** Each contract specifies a hard token/dollar cap. The specialist runtime enforces this cap and aborts execution on overrun. A specialist cannot spend beyond what the contract permits.
- **Subprocess isolation.** Specialists run in a Bun subprocess, not in the CLI process. They do not inherit the CLI's full environment by default — only the env vars the contract explicitly allows.

**How attackers are caught:** The Sigstore certificate transparency log records the publisher's GitHub identity at the moment of signing. Revocation of a bundle's hash poisons it across all future installs. A user who already installed a revoked bundle will see a warning on next invocation.

---

## Adversary 2: Compromised Developer Machine

**Profile:** A threat actor who has gained code execution on the developer's local machine via malware, a supply chain attack on dev tools (e.g., a compromised npm package), stolen credentials, or physical access. This adversary has the same OS-level permissions as the developer.

### STRIDE Analysis

| Threat | Scenario |
|--------|----------|
| **Spoofing** | Attacker uses the user's signing key (or a copy of it obtained from disk) to forge new lineage events attributed to the legitimate user. The ledger cannot distinguish forged events from real ones if the key is stolen. |
| **Tampering** | Attacker opens the SQLite lineage database with a standard SQLite client and edits, inserts, or deletes rows — removing evidence of a failed contract run or inserting false successful outcomes. |
| **Repudiation** | Attacker deletes lineage records for actions they performed using the compromised machine. The user cannot prove those actions occurred. |
| **Information Disclosure** | Attacker reads the signing key file (if stored unencrypted), reads the lineage DB to reconstruct what the agent did and what contracts are active, or reads API keys stored in the shell environment or `.env` files. |
| **Denial of Service** | Attacker deletes or corrupts the SQLite lineage DB entirely, making all historical records unrecoverable. |
| **Elevation of Privilege** | Attacker uses the API keys Argus has access to (e.g., `OPENAI_API_KEY`) to make LLM calls outside of any contract, running up the user's bill or exfiltrating data through the LLM. |

### Planned Mitigations

- **Signing key encrypted at rest.** The Ed25519 signing key is stored encrypted via libsodium `secretbox`. A passphrase is required to unlock it at signing time. An attacker who copies the key file off disk cannot use it without the passphrase.
- **Append-only ledger API.** The Argus application layer exposes no delete or update path for lineage records. An attacker cannot instruct Argus itself to remove events; they must tamper with the SQLite file directly, which breaks chain integrity.
- **Tamper detection via chain verification.** Each lineage event includes the BLAKE3 hash of the previous event (chain linking). Any row deletion, insertion, or modification breaks the chain. `argus lineage verify` detects and reports the break.
- **Third-party verifiability.** Given a lineage export and the user's public key, any third party can independently verify the chain — without trusting Argus, the local machine, or any Argus server. This means a verifier on a separate, clean machine can detect divergence even if the local machine is fully compromised.
- **`argus lineage verify` designed for offline audit.** The verify command is intentionally stateless and portable — it can be run on a second machine against an exported snapshot. This is the canonical audit path when the originating machine is untrusted.

**Residual risk acknowledgment:** If the machine is fully compromised at the OS level, local mitigations are best-effort. The signing key encryption raises the bar but does not make key theft impossible (e.g., a keylogger captures the passphrase). The design assumes the OS-level secrets store (Keychain on macOS, libsecret on Linux) provides the last line of key protection, and that the lineage chain's value is primarily for post-hoc detection and third-party verification rather than prevention.

**How attackers are caught:** The lineage chain breaks on tampered records — `argus lineage verify` reports the exact event index where the hash chain diverges. Signature verification fails on forged events (the attacker doesn't have the passphrase for the real key). A detached verifier on another machine detects the divergence independently.

---

## Adversary 3: Supply Chain Attacker

**Profile:** A threat actor who compromises a dependency in Argus's own build or release pipeline. Attack vectors include: a malicious npm/JSR package pulled into the Argus build, a compromised GitHub Actions runner or third-party Action, a build machine compromise, or a typosquatting package that Argus inadvertently depends on.

### STRIDE Analysis

| Threat | Scenario |
|--------|----------|
| **Spoofing** | Attacker publishes `argus-cli` on npm (typosquatting `@argus/cli`) or hijacks a dependency package to distribute code under Argus's trusted name. |
| **Tampering** | Attacker injects malicious code into a release artifact after it exits the CI pipeline but before it reaches the distribution endpoint — or compromises the CI pipeline itself to inject code into the binary before signing. |
| **Repudiation** | Attacker claims the compromise happened in a dependency they don't control and denies modifying the Argus release. Without an SBOM and artifact provenance chain, attribution is difficult. |
| **Information Disclosure** | A compromised GitHub Actions workflow has access to repository secrets (e.g., npm publish tokens, signing key material). An attacker exfiltrates these to take over future releases. |
| **Denial of Service** | Attacker breaks the CI pipeline (e.g., deletes signing keys from GitHub Secrets, introduces a build-breaking commit) so no new releases can ship, blocking security patches. |
| **Elevation of Privilege** | A malicious GitHub Action uses the workflow's OIDC token to sign a tampered artifact with Sigstore, making it appear to carry Argus's legitimate signature. |

### Planned Mitigations

- **Cosign + Sigstore release signing.** Every release artifact is signed with Cosign via Sigstore before distribution. Users can verify the artifact signature against Argus's known signing identity before install. A binary tampered after signing will fail Cosign verification.
- **SBOM generation on every release.** Syft generates a Software Bill of Materials for every release. The SBOM is published alongside the artifact. Consumers (and automated scanners) can diff SBOMs across versions to detect unexpected dependency additions.
- **Trivy + Gitleaks on every PR.** Trivy scans for known CVEs in dependencies. Gitleaks scans for accidentally committed secrets. Both run as required CI checks — a PR cannot merge if either finds a blocking issue.
- **GitHub Actions pinned to commit SHAs.** All `uses:` references in workflow files are pinned to specific commit SHAs rather than mutable version tags (e.g., `uses: actions/checkout@a81bbbf` not `uses: actions/checkout@v3`). A compromised tag cannot silently redirect to malicious code.
- **npm package name squatted.** The Argus npm package name is registered early, even before the package is published, to prevent typosquatting attacks that would let an attacker distribute malware under the expected package name.
- **Reproducible builds (Phase 5).** The goal is that the same source commit always produces the same binary hash. This allows independent parties to verify that a distributed binary matches the published source — making silent injection detectable.

**How attackers are caught:** Cosign signature verification fails if the binary was modified after signing. An SBOM diff against the previous release reveals unexpected new dependencies. Pinned SHA references mean a compromised upstream Action tag cannot silently affect a workflow that was already committed.

---

---

## Adversary 4: Malicious Marketplace Publisher (v0.2)

**Profile:** A threat actor who creates a publisher identity in the Argus marketplace and publishes a specialist bundle containing malicious code (a backdoor, credential harvester, or supply chain implant). Unlike Adversary 1 (anonymous skill author), this adversary has a registered publisher identity — making them traceable — but abuses the trust their identity conveys.

### STRIDE Analysis

| Threat | Scenario |
|--------|----------|
| **Spoofing** | Attacker registers a publisher display name (`argus-official`) that closely mimics a trusted publisher (`Argus Core Team`). Users see a signed bundle from a "trusted-looking" publisher and install without checking the publisher id. |
| **Tampering** | After publishing a legitimate specialist that gains adoption, the attacker rotates their publisher key (by registering a new publisher id and re-publishing) and distributes a trojanized bundle with a valid signature from the new key. Users who verify signatures see a valid signature — but from a different publisher id. |
| **Repudiation** | Attacker claims their publisher private key was stolen and denies having signed the malicious bundle. The `created_at` timestamp in the `publishers` table and the `bundledAt` field in the manifest are the only timestamps, and they are not externally anchored. |
| **Information Disclosure** | Malicious specialist reads `process.env` during execution to exfiltrate `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or other secrets and sends them to an attacker-controlled endpoint. The bundle passes signature verification because the attacker's own key signed it. |
| **Denial of Service** | Specialist contains an infinite loop or issues unbounded LLM calls, consuming the user's budget before the contract hard cap kicks in. |
| **Elevation of Privilege** | Specialist includes a Node native addon (`.node` binary), bypassing the Bun subprocess isolation to gain full host filesystem and network access. |

### Mitigations (v0.1)

- **Signed bundles verified on install.** `argus fleet install-bundle` calls `verifyBundle()`, which verifies the Ed25519 signature against the `publisherIdentity.publicKeyHex` embedded in the manifest. A bundle whose bytes have been modified since signing will fail BLAKE3 payload hash verification and be rejected before any code runs.
- **Publisher identity is non-anonymous.** `argus publisher register` requires a display name and generates a keypair whose public key is stored in `marketplace.db`. There is no anonymous publishing path. The publisher id and public key are embedded in every signed manifest.
- **Revocation list blocks known-bad bundles.** `argus marketplace revoke <bundleHash>` adds the bundle's BLAKE3 hash to the `revocations` table. `install-bundle` checks revocation before verifying the signature. A revoked bundle cannot be installed even if its signature is valid.
- **Content-addressed bundles.** The `codeHash` field in the manifest is the BLAKE3 hash of `specialist.ts`. Any change to the code changes the hash, which changes the payload over which the signature is computed, which invalidates the signature.

### Residual Risks (v0.2)

- **No certificate transparency log for publisher registration.** Publisher identity is local only — there is no external anchor that records "publisher X registered at time T." A compromised local `marketplace.db` can be silently modified. Future work: anchor publisher registrations in a Sigstore certificate transparency log.
- **No behavioral analysis of bundles.** A malicious bundle that passes signature verification is not further analyzed for malicious behavior before installation. Future work: static analysis pipeline (taint analysis, capability scanning) on published bundles.
- **Revocation requires the correct `bundleHash`.** Revocation is keyed on the BLAKE3 hash of the exact `.tar.gz` file. If an attacker re-publishes a malicious bundle with minor changes, the new bundle has a different hash and is not covered by the existing revocation entry.

---

## Residual Risks (v0.1)

The following threats are acknowledged but not fully mitigated in the current version:

- **No HSM support for the signing key.** The signing key is protected by libsodium encryption and the OS secrets store, but not by a hardware security module. A sufficiently privileged attacker on the local machine can extract it. Future work: support YubiKey or other hardware keys via PKCS#11.
- **Subprocess sandbox is not a VM.** Specialists run in a Bun subprocess, which provides process-level isolation. A specialist that includes a native addon (`.node` file) could potentially escape the sandbox. Future work: run specialists inside a WASM sandbox (e.g., Wasmtime) with an explicit capability model.
- **No SOC 2 audit of the build pipeline.** The mitigations described for Adversary 3 are engineering controls, not independently audited controls. Future work: third-party audit of the CI/CD pipeline and release signing process.
- **Revocation requires network access.** Revocation list checks require an outbound network call. An attacker with network control (or a fully offline environment) can prevent revocation checks from succeeding. Future work: signed, cached revocation snapshots with a mandatory staleness limit.
- **No content scanning of specialist bundles pre-publish.** The marketplace currently relies on signature-based identity, not behavioral analysis of bundle code. A malicious bundle that passes signature checks is not further analyzed. Future work: static analysis pipeline on published bundles.

---

## References

- Lineage specification: `docs/lineage-spec.md` (forthcoming)
- Signing key implementation: `packages/lineage` (forthcoming)
- [Sigstore documentation](https://docs.sigstore.dev/)
- [Cosign](https://github.com/sigstore/cosign)
- [Syft SBOM generator](https://github.com/anchore/syft)
- [Trivy vulnerability scanner](https://github.com/aquasecurity/trivy)
- [Gitleaks](https://github.com/gitleaks/gitleaks)
- [STRIDE threat modeling methodology — Microsoft](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats)
- [libsodium secretbox](https://doc.libsodium.org/secret-key_cryptography/secretbox)
