import dotenvx from "@dotenvx/dotenvx";
import { resolve } from "node:path";

export const projectRoot = resolve(import.meta.dir, "../..");
export const envPath = resolve(projectRoot, ".env");
export const envKeysPath = "/root/.env.keys";

dotenvx.config({ path: [envPath], envKeysFile: envKeysPath, quiet: true });

function integer(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

const adminApiKey = process.env.ADMIN_API_KEY_CY;
if (!adminApiKey || adminApiKey.length < 32) {
  throw new Error("ADMIN_API_KEY_CY must contain at least 32 characters");
}

const requiredSecrets = ["ADMIN_PASSWORD_HASH_CY", "SMTP_USER", "SMTP_PASSWORD_CY"] as const;
for (const key of requiredSecrets) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: integer("PORT", 3000, 1, 65535),
  nodeEnv: process.env.NODE_ENV ?? "development",
  publicOrigin: process.env.PUBLIC_ORIGIN ?? "http://localhost:3000",
  adminApiKey,
  adminLogin: process.env.ADMIN_LOGIN ?? "profithub",
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH_CY!,
  smtpUser: process.env.SMTP_USER!,
  smtpPassword: process.env.SMTP_PASSWORD_CY!,
  valkeyUrl: process.env.VALKEY_URL ?? "redis://127.0.0.1:6379",
  defaultTimezoneOffsetMinutes: integer(
    "DEFAULT_TIMEZONE_OFFSET_MINUTES",
    300,
    -720,
    840,
  ),
};

