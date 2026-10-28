import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import dotenvx from "@dotenvx/dotenvx";
import { envKeysPath, envPath, projectRoot } from "./config";
import { maskSensitiveValue } from "./security";

const keyPattern = /^[A-Z_][A-Z0-9_]*$/;

export function readMaskedEnvironment() {
  const raw = readFileSync(envPath, "utf8");
  const encryptedOrPlain = dotenvx.parse(raw);
  return Object.keys(encryptedOrPlain).sort().map((key) => ({
    key,
    value: maskSensitiveValue(key, process.env[key] ?? encryptedOrPlain[key] ?? ""),
    sensitive: key.includes("CY"),
  }));
}

export async function setEnvironmentValue(key: string, value: string) {
  if (!keyPattern.test(key)) throw new Error("Invalid environment key");
  const child = spawn(
    process.execPath,
    [resolve(projectRoot, "backend/node_modules/.bin/dotenvx"), "set", key, value, "-fk", envKeysPath, "-f", envPath],
    { cwd: process.cwd(), stdio: ["ignore", "ignore", "pipe"] },
  );
  let error = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { error += chunk; });
  const exitCode = await new Promise<number | null>((resolve) => child.on("close", resolve));
  if (exitCode !== 0) throw new Error(error.trim() || "dotenvx update failed");
  process.env[key] = value;
}

