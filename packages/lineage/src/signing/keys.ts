import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { randomBytes } from "@noble/ciphers/webcrypto";
import { ed25519 } from "@noble/curves/ed25519";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";

export interface KeyPair {
  privateKey: Uint8Array; // 32 bytes
  publicKey: Uint8Array; // 32 bytes
}

export interface KeyPairHex {
  privateKey: string; // 64-char hex
  publicKey: string; // 64-char hex
}

// Key file format: version(4 LE) + pbkdf2_salt(32) + xchacha_nonce(24) + encrypted_privkey(48) = 108 bytes
const VERSION_1 = 1; // legacy: 100k PBKDF2, no AAD
const VERSION_2 = 2; // current: 600k PBKDF2, AAD = version+salt
const PBKDF2_ITERS_V1 = 100_000;
const PBKDF2_ITERS_V2 = 600_000;

export function generateKeyPair(): KeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function encryptKeyPair(kp: KeyPair, passphrase: string): Uint8Array {
  const salt = randomBytes(32);
  const nonce = randomBytes(24);
  // Build header first (needed for AAD)
  const header = new Uint8Array(36);
  new DataView(header.buffer).setUint32(0, VERSION_2, true);
  header.set(salt, 4);
  const dk = pbkdf2(sha256, passphrase, salt, { c: PBKDF2_ITERS_V2, dkLen: 32 });
  const cipher = xchacha20poly1305(dk, nonce, header); // header = AAD
  const encrypted = cipher.encrypt(kp.privateKey); // 32 + 16 AEAD tag = 48 bytes
  const out = new Uint8Array(4 + 32 + 24 + encrypted.length);
  out.set(header, 0); // version(4) + salt(32)
  out.set(nonce, 36);
  out.set(encrypted, 60);
  return out;
}

export function decryptKeyPair(data: Uint8Array, passphrase: string): KeyPair {
  if (data.length < 108) throw new Error("invalid key file: too short");
  const version = new DataView(data.buffer, data.byteOffset).getUint32(0, true);
  const salt = data.slice(4, 36);
  const nonce = data.slice(36, 60);
  const ciphertext = data.slice(60);

  let dk: Uint8Array;
  let cipher: ReturnType<typeof xchacha20poly1305>;

  if (version === VERSION_1) {
    dk = pbkdf2(sha256, passphrase, salt, { c: PBKDF2_ITERS_V1, dkLen: 32 });
    cipher = xchacha20poly1305(dk, nonce);
  } else if (version === VERSION_2) {
    dk = pbkdf2(sha256, passphrase, salt, { c: PBKDF2_ITERS_V2, dkLen: 32 });
    const aad = data.slice(0, 36); // version(4) + salt(32)
    cipher = xchacha20poly1305(dk, nonce, aad);
  } else {
    throw new Error(`unsupported key version: ${version}`);
  }

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
