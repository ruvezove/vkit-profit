import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { projectRoot } from "./config";

const dataDir = resolve(projectRoot, "backend/data");
mkdirSync(dataDir, { recursive: true });

export const databasePath = process.env.DATABASE_PATH
  ? resolve(projectRoot, process.env.DATABASE_PATH)
  : resolve(dataDir, "profit-hub.sqlite");
export const db = new Database(databasePath, { create: true, strict: true });

db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA foreign_keys = ON;");
db.run("PRAGMA busy_timeout = 5000;");

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('comment', 'request', 'wish')),
    author_name TEXT NOT NULL,
    contact TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TEXT NOT NULL,
    moderated_at TEXT
  );

  CREATE INDEX IF NOT EXISTS submissions_status_type_idx
  ON submissions(status, type, created_at DESC);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
`);

export function getSetting(key: string): string | undefined {
  return db.query<{ value: string }, [string]>("SELECT value FROM settings WHERE key = ?").get(key)?.value;
}

export function setSetting(key: string, value: string) {
  db.query(
    `INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, new Date().toISOString());
}

export function audit(action: string, resourceType: string, resourceId?: string, metadata: object = {}) {
  db.query(
    "INSERT INTO audit_events(id, action, resource_type, resource_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(crypto.randomUUID(), action, resourceType, resourceId ?? null, JSON.stringify(metadata), new Date().toISOString());
}

