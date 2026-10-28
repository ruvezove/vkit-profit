import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "./db";
import { projectRoot } from "./config";

const backupDir = resolve(projectRoot, "backups");
mkdirSync(backupDir, { recursive: true });

export async function createBackup() {
  const timestamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
  const destination = resolve(backupDir, `profit-hub-${timestamp}.sqlite`);
  await db.serialize(destination);
  return destination;
}

export function scheduleBackups() {
  const interval = setInterval(() => void createBackup(), 12 * 60 * 60 * 1000);
  interval.unref();
  return interval;
}

