import type { FastifyInstance } from "fastify";
import { statSync } from "node:fs";
import { createBackup } from "../backup";
import { config } from "../config";
import { audit, db, getSetting, setSetting } from "../db";
import { readMaskedEnvironment, setEnvironmentValue } from "../env-admin";
import { scheduleRestart } from "../restart";
import { requireAdmin, strictObject } from "../security";

type Duration = { amount: number; unit: "seconds" | "minutes" | "hours" | "days" };
const durationSchema = {
  type: "object",
  ...strictObject,
  required: ["amount", "unit"],
  properties: {
    amount: { type: "integer", minimum: 1, maximum: 365 },
    unit: { type: "string", enum: ["seconds", "minutes", "hours", "days"] },
  },
} as const;

const durationMs = ({ amount, unit }: Duration) => amount * ({ seconds: 1000, minutes: 60_000, hours: 3_600_000, days: 86_400_000 }[unit]);

export type HealthMetrics = {
  samples: number[];
  startedAt: number;
};

export async function adminRoutes(app: FastifyInstance, metrics: HealthMetrics) {
  app.addHook("preHandler", requireAdmin);

  app.get("/health", async () => {
    const dbStarted = performance.now();
    db.query("SELECT 1").get();
    const databaseLatencyMs = performance.now() - dbStarted;
    let valkeyLatencyMs: number | null = null;
    let valkey = "unavailable";
    try {
      const client = new Bun.RedisClient(config.valkeyUrl, { connectionTimeout: 1000, idleTimeout: 1000 });
      const started = performance.now();
      await client.send("PING", []);
      valkeyLatencyMs = performance.now() - started;
      valkey = "ok";
      client.close();
    } catch {
      valkey = "unavailable";
    }
    const samples = metrics.samples.length ? metrics.samples : [databaseLatencyMs];
    return {
      status: "ok",
      uptimeSeconds: Math.floor((Date.now() - metrics.startedAt) / 1000),
      latencyMs: {
        min: Number(Math.min(...samples).toFixed(2)),
        max: Number(Math.max(...samples).toFixed(2)),
        database: Number(databaseLatencyMs.toFixed(2)),
        valkey: valkeyLatencyMs === null ? null : Number(valkeyLatencyMs.toFixed(2)),
      },
      dependencies: { sqlite: "ok", valkey },
    };
  });

  app.get("/submissions", async (request) => {
    const query = request.query as { type?: string; status?: string };
    const allowedTypes = ["comment", "request", "wish"];
    const allowedStatuses = ["pending", "approved", "rejected"];
    const type = query.type && allowedTypes.includes(query.type) ? query.type : null;
    const status = query.status && allowedStatuses.includes(query.status) ? query.status : null;
    const rows = db.query(
      `SELECT id, type, author_name AS authorName, contact, message, status,
              created_at AS createdAt, moderated_at AS moderatedAt
       FROM submissions
       WHERE (? IS NULL OR type = ?) AND (? IS NULL OR status = ?)
       ORDER BY created_at DESC LIMIT 200`,
    ).all(type, type, status, status);
    return { submissions: rows };
  });

  app.patch<{ Params: { id: string }; Body: { status: "approved" | "rejected" } }>(
    "/submissions/:id/moderation",
    {
      schema: {
        params: { type: "object", ...strictObject, required: ["id"], properties: { id: { type: "string", format: "uuid" } } },
        body: { type: "object", ...strictObject, required: ["status"], properties: { status: { type: "string", enum: ["approved", "rejected"] } } },
      },
    },
    async (request, reply) => {
      const result = db.query("UPDATE submissions SET status = ?, moderated_at = ? WHERE id = ?")
        .run(request.body.status, new Date().toISOString(), request.params.id);
      if (result.changes === 0) return reply.code(404).send({ error: "not_found" });
      audit(`submission.${request.body.status}`, "submission", request.params.id);
      return { id: request.params.id, status: request.body.status };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/submissions/:id",
    { schema: { params: { type: "object", ...strictObject, required: ["id"], properties: { id: { type: "string", format: "uuid" } } } } },
    async (request, reply) => {
      const result = db.query("DELETE FROM submissions WHERE id = ?").run(request.params.id);
      if (result.changes === 0) return reply.code(404).send({ error: "not_found" });
      audit("submission.deleted", "submission", request.params.id);
      return reply.code(204).send();
    },
  );

  app.post<{ Body: { until?: string; duration?: Duration } }>(
    "/rate-limit/bypass",
    {
      schema: {
        body: {
          type: "object",
          ...strictObject,
          properties: { until: { type: "string", format: "date-time" }, duration: durationSchema },
          anyOf: [{ required: ["until"] }, { required: ["duration"] }],
        },
      },
    },
    async (request) => {
      const until = request.body.until ? new Date(request.body.until) : new Date(Date.now() + durationMs(request.body.duration!));
      if (until.getTime() <= Date.now()) {
        const error = new Error("Expiry must be in the future") as Error & { statusCode: number };
        error.statusCode = 400;
        throw error;
      }
      setSetting("rate_limit_bypass_until", until.toISOString());
      audit("rate_limit.bypass", "setting", undefined, { until: until.toISOString() });
      return { until: until.toISOString() };
    },
  );

  app.put<{ Body: { offsetMinutes: number } }>(
    "/settings/timezone",
    { schema: { body: { type: "object", ...strictObject, required: ["offsetMinutes"], properties: { offsetMinutes: { type: "integer", minimum: -720, maximum: 840 } } } } },
    async (request) => {
      setSetting("timezone_offset_minutes", String(request.body.offsetMinutes));
      audit("timezone.updated", "setting", undefined, { offsetMinutes: request.body.offsetMinutes });
      return { offsetMinutes: request.body.offsetMinutes };
    },
  );

  app.put<{ Body: { origin: string } }>(
    "/settings/site-origin",
    { schema: { body: { type: "object", ...strictObject, required: ["origin"], properties: { origin: { type: "string", format: "uri", pattern: "^https?://", maxLength: 2048 } } } } },
    async (request) => {
      const origin = new URL(request.body.origin).origin;
      setSetting("public_origin", origin);
      audit("site_origin.updated", "setting", undefined, { origin });
      return { origin };
    },
  );

  app.post<{ Body: { at?: string; duration?: Duration } }>(
    "/restart",
    {
      schema: {
        body: {
          type: "object",
          ...strictObject,
          properties: { at: { type: "string", format: "date-time" }, duration: durationSchema },
          anyOf: [{ required: ["at"] }, { required: ["duration"] }],
        },
      },
    },
    async (request) => {
      const at = request.body.at ? new Date(request.body.at) : new Date(Date.now() + durationMs(request.body.duration!));
      if (at.getTime() <= Date.now()) throw new Error("Restart time must be in the future");
      scheduleRestart(at);
      audit("server.restart_scheduled", "process", "vkit-profit", { at: at.toISOString() });
      return { scheduledAt: at.toISOString() };
    },
  );

  app.post("/backup", async () => {
    const path = await createBackup();
    audit("database.backup", "database");
    return { createdAt: new Date().toISOString(), bytes: statSync(path).size };
  });

  app.get("/environment", async () => ({ variables: readMaskedEnvironment() }));

  app.put<{ Body: { key: string; value: string } }>(
    "/environment",
    { schema: { body: { type: "object", ...strictObject, required: ["key", "value"], properties: { key: { type: "string", pattern: "^[A-Z_][A-Z0-9_]*$", maxLength: 128 }, value: { type: "string", maxLength: 8192 } } } } },
    async (request) => {
      await setEnvironmentValue(request.body.key, request.body.value);
      audit("environment.updated", "environment", request.body.key);
      return { key: request.body.key, restartRequired: true };
    },
  );

  app.get("/settings", async () => ({
    timezoneOffsetMinutes: Number(getSetting("timezone_offset_minutes") ?? config.defaultTimezoneOffsetMinutes),
    origin: getSetting("public_origin") ?? config.publicOrigin,
    rateLimitBypassUntil: getSetting("rate_limit_bypass_until") || null,
    scheduledRestartAt: getSetting("scheduled_restart_at") || null,
  }));
}

