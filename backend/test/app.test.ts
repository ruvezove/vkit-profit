import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";

const projectRoot = resolve(import.meta.dir, "../..");
const testDatabase = resolve(projectRoot, "temp/backend-test.sqlite");
const adminKey = "test-admin-key-that-is-longer-than-thirty-two-characters";
let app: FastifyInstance;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_PATH = "temp/backend-test.sqlite";
  process.env.ADMIN_API_KEY_CY = adminKey;
  process.env.ADMIN_LOGIN = "profithub";
  process.env.ADMIN_PASSWORD_HASH_CY = await Bun.password.hash("test-admin-password", { algorithm: "bcrypt", cost: 10 });
  process.env.SMTP_USER = "test@gmail.com";
  process.env.SMTP_PASSWORD_CY = "test-smtp-password";
  rmSync(testDatabase, { force: true });
  const module = await import("../src/app");
  app = await module.buildApp();
});

afterAll(async () => {
  await app.close();
  rmSync(testDatabase, { force: true });
  rmSync(`${testDatabase}-wal`, { force: true });
  rmSync(`${testDatabase}-shm`, { force: true });
});

const adminHeaders = { authorization: `Bearer ${adminKey}` };

describe("security baseline", () => {
  test("rejects unauthenticated administrator access", async () => {
    const response = await app.inject({ method: "GET", url: "/api/admin/health" });
    expect(response.statusCode).toBe(401);
  });

  test("reports dependency latency to an administrator", async () => {
    const response = await app.inject({ method: "GET", url: "/api/admin/health", headers: adminHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json().latencyMs.min).toBeNumber();
    expect(response.json().latencyMs.max).toBeNumber();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  test("rejects unknown submission properties", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/comments",
      payload: { authorName: "Test", message: "A valid message body", role: "admin" },
    });
    expect(response.statusCode).toBe(400);
  });

  test("stores SQL-looking input as plain data and publishes only after approval", async () => {
    const message = "Robert'); DROP TABLE submissions; --";
    const create = await app.inject({ method: "POST", url: "/api/comments", payload: { authorName: "Robert", message } });
    expect(create.statusCode).toBe(202);
    const id = create.json().id;

    const before = await app.inject({ method: "GET", url: "/api/comments" });
    expect(before.json().comments).toHaveLength(0);

    const moderate = await app.inject({ method: "PATCH", url: `/api/admin/submissions/${id}/moderation`, headers: adminHeaders, payload: { status: "approved" } });
    expect(moderate.statusCode).toBe(200);
    const after = await app.inject({ method: "GET", url: "/api/comments" });
    expect(after.json().comments[0].message).toBe(message);
  });

  test("starts staged registration and hashes passwords with Argon2id", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register/start",
      payload: { surname: "Student", givenName: "Test", patronymic: "Learner", login: "student.one", password: "correct horse battery staple" },
    });
    expect(response.statusCode).toBe(201);
    const { db } = await import("../src/db");
    const row = db.query<{ password_hash: string }, []>("SELECT password_hash FROM registration_drafts LIMIT 1").get();
    expect(row?.password_hash.startsWith("$argon2id$")).toBe(true);
  });

  test("verifies email without authenticating and then permits login", async () => {
    const { db } = await import("../src/db");
    const { hashOneTimeSecret, expiresIn, fiveMinutesMs } = await import("../src/auth-crypto");
    const passwordHash = await Bun.password.hash("student secure password", { algorithm: "argon2id" });
    const userId = crypto.randomUUID();
    const token = "verification-token-for-test-account-123456";
    db.query("INSERT INTO users(id, email, display_name, password_hash, role, created_at, surname, given_name, patronymic, login) VALUES (?, ?, ?, ?, 'student', ?, ?, ?, ?, ?)")
      .run(userId, "verified@gmail.com", "Verified Student", passwordHash, new Date().toISOString(), "Student", "Verified", "Test", "verified.student");
    db.query("INSERT INTO email_verification_tokens(id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
      .run(crypto.randomUUID(), userId, hashOneTimeSecret(token, "email"), expiresIn(fiveMinutesMs));

    const verify = await app.inject({ method: "GET", url: `/api/auth/verify-email?token=${token}` });
    expect(verify.statusCode).toBe(200);
    expect(verify.json().authenticated).toBe(false);

    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { identifier: "verified.student", password: "student secure password" } });
    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toContain("HttpOnly");
  });

  test("authenticates the administrator with the configured bcrypt hash", async () => {
    const response = await app.inject({ method: "POST", url: "/api/auth/admin/login", payload: { login: "profithub", password: "test-admin-password" } });
    expect(response.statusCode).toBe(200);
    expect(response.json().role).toBe("admin");
  });

  test("masks confidential environment values", async () => {
    const response = await app.inject({ method: "GET", url: "/api/admin/environment", headers: adminHeaders });
    expect(response.statusCode).toBe(200);
    const item = response.json().variables.find((variable: { key: string }) => variable.key === "ADMIN_API_KEY_CY");
    expect(item.sensitive).toBe(true);
    expect(item.value).not.toContain(adminKey);
  });

  test("creates a consistent SQLite backup", async () => {
    const { createBackup } = await import("../src/backup");
    const path = await createBackup();
    expect(statSync(path).size).toBeGreaterThan(0);
    rmSync(path, { force: true });
  });
});

