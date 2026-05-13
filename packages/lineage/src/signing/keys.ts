import { ed25519 } from "@noble/curves/ed25519";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { randomBytes } from "@noble/ciphers/webcrypto";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";

export interface KeyPair {
  privateKey: Uint8Array; // 32 bytes
  publicKey: Uint8Array;  // 32 bytes
}

export interface KeyPairHex {
  privateKey: string; // 64-char hex
  publicKey: string;  // 64-char hex
}

const VERSION = 1;
const PBKDF2_ITERS = 100_000;

export function generateKeyPair(): KeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function encryptKeyPair(kp: KeyPair, passphrase: string): Uint8Array {
  const salt = randomBytes(32);
  const nonce = randomBytes(24);
  const dk = pbkdf2(sha256, passphrase, salt, { c: PBKDF2_ITERS, dkLen: 32 });
  const cipher = xchacha20poly1305(dk, nonce);
  const encrypted = cipher.encrypt(kp.privateKey); // 32 + 16 AEAD tag = 48 bytes
  const out = new Uint8Array(4 + 32 + 24 + encrypted.length);
  new DataView(out.buffer).setUint32(0, VERSION, true);
  out.set(salt, 4);
  out.set(nonce, 36);
  out.set(encrypted, 60);
  return out;
}

export function decryptKeyPair(data: Uint8Array, passphrase: string): KeyPair {
  if (data.length < 108) throw new Error("invalid key file: too short");
  const version = new DataView(data.buffer, data.byteOffset).getUint32(0, true);
  if (version !== VERSION) throw new Error(`unsupported key version: ${version}`);
  const salt = data.slice(4, 36);
  const nonce = data.slice(36, 60);
  const ciphertext = data.slice(60);
  const dk = pbkdf2(sha256, passphrase, salt, { c: PBKDF2_ITERS, dkLen: 32 });
  const cipher = xchacha20poly1305(dk, nonce);
  const privateKey = cipher.decrypt(ciphertext);
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function keyPairToHex(kp: KeyPair): KeyPairHex {
  return {
    privateKey: bytesToHex(kp.privateKey),
    publicKey: bytesToHex(kp.publicKey),
  };
}
