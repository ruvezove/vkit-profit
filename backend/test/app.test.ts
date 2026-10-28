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

  test("hashes new account passwords with Argon2id", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "student@example.com", displayName: "Student", password: "correct horse battery staple" },
    });
    expect(response.statusCode).toBe(201);
    const { db } = await import("../src/db");
    const row = db.query<{ password_hash: string }, []>("SELECT password_hash FROM users LIMIT 1").get();
    expect(row?.password_hash.startsWith("$argon2id$")).toBe(true);
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

