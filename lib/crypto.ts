import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** AES-256-GCM with a key derived from TOKEN_ENCRYPTION_KEY. Output: iv.tag.ciphertext (base64url). */
function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (raw && raw.length >= 16) return createHash("sha256").update(raw).digest();
  // Fallback: a separate key derived from AUTH_SECRET, so hosting needs one less secret.
  const auth = process.env.AUTH_SECRET;
  if (auth && auth.length >= 32) return createHash("sha256").update(`token-encryption:${auth}`).digest();
  throw new Error("Set TOKEN_ENCRYPTION_KEY or AUTH_SECRET (openssl rand -base64 32).");
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(token: string): string {
  const [iv, tag, data] = token.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function randomState(): string {
  return randomBytes(24).toString("base64url");
}
