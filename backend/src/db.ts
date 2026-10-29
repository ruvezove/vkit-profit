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

  CREATE TABLE IF NOT EXISTS registration_drafts (
    id TEXT PRIMARY KEY,
    surname TEXT NOT NULL,
    given_name TEXT NOT NULL,
    patronymic TEXT NOT NULL,
    login TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );

  CREATE TABLE IF NOT EXISTS password_reset_codes (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    challenge_hash TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const userColumns = new Set(
  db.query<{ name: string }, []>("PRAGMA table_info(users)").all().map((column) => column.name),
);
const missingUserColumns = [
  ["surname", "TEXT"],
  ["given_name", "TEXT"],
  ["patronymic", "TEXT"],
  ["login", "TEXT COLLATE NOCASE"],
  ["email_verified_at", "TEXT"],
] as const;
for (const [name, definition] of missingUserColumns) {
  if (!userColumns.has(name)) db.run(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
}
db.run("CREATE UNIQUE INDEX IF NOT EXISTS users_login_unique_idx ON users(login) WHERE login IS NOT NULL;");

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

