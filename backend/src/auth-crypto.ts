import { createHash, randomBytes, randomInt } from "node:crypto";

export const fiveMinutesMs = 5 * 60 * 1000;

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function createConfirmationCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOneTimeSecret(secret: string, subject = "") {
  return createHash("sha256").update(`${subject}:${secret}`, "utf8").digest("hex");
}

export function expiresIn(milliseconds: number) {
  return new Date(Date.now() + milliseconds).toISOString();
}

