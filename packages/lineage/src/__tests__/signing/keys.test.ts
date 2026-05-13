import { ed25519 } from "@noble/curves/ed25519";
import { describe, expect, it } from "vitest";
import {
  decryptKeyPair,
  encryptKeyPair,
  generateKeyPair,
  keyPairToHex,
} from "../../signing/keys.js";

describe("generateKeyPair", () => {
  it("returns 32-byte private and public keys", () => {
    const kp = generateKeyPair();
    expect(kp.privateKey).toHaveLength(32);
    expect(kp.publicKey).toHaveLength(32);
  });

  it("generates different keys each call", () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(a.privateKey).not.toEqual(b.privateKey);
  });

  it("publicKey is derived from privateKey", () => {
    const kp = generateKeyPair();
    expect(kp.publicKey).toEqual(ed25519.getPublicKey(kp.privateKey));
  });
});

describe("encryptKeyPair / decryptKeyPair", () => {
  it("round-trip with correct passphrase", () => {
    const kp = generateKeyPair();
    const encrypted = encryptKeyPair(kp, "my-passphrase");
    const recovered = decryptKeyPair(encrypted, "my-passphrase");
    expect(recovered.privateKey).toEqual(kp.privateKey);
    expect(recovered.publicKey).toEqual(kp.publicKey);
  });

  it("encrypted blob is 108 bytes", () => {
    const kp = generateKeyPair();
    const encrypted = encryptKeyPair(kp, "test");
    expect(encrypted).toHaveLength(108);
  });

  it("throws with wrong passphrase", () => {
    const kp = generateKeyPair();
    const encrypted = encryptKeyPair(kp, "correct");
    expect(() => decryptKeyPair(encrypted, "wrong")).toThrow();
  });

  it("two encryptions of same key produce different blobs (random nonce)", () => {
    const kp = generateKeyPair();
    const a = encryptKeyPair(kp, "same");
    const b = encryptKeyPair(kp, "same");
    expect(a).not.toEqual(b);
  });
});

describe("keyPairToHex", () => {
  it("returns hex strings of expected length", () => {
    const kp = generateKeyPair();
    const hex = keyPairToHex(kp);
    expect(hex.publicKey).toMatch(/^[0-9a-f]{64}$/);
    expect(hex.privateKey).toMatch(/^[0-9a-f]{64}$/);
  });
});
