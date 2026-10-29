import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { config, projectRoot } from "./config";
import { getSetting } from "./db";
import { adminRoutes, type HealthMetrics } from "./routes/admin";
import { publicRoutes } from "./routes/public";
import { authRoutes } from "./routes/auth";

export async function buildApp() {
  const logsDir = resolve(projectRoot, "logs");
  mkdirSync(logsDir, { recursive: true });
  const app = Fastify({
    trustProxy: false,
    bodyLimit: 64 * 1024,
    requestTimeout: 15_000,
    logger: {
      level: config.nodeEnv === "production" ? "info" : "debug",
      file: resolve(logsDir, "server.log"),
      redact: ["req.headers.authorization", "req.headers.cookie", "password", "value"],
    },
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, allErrors: false } },
  });

  const metrics: HealthMetrics = { samples: [], startedAt: Date.now() };
  const requestStarts = new WeakMap<object, number>();
  app.addHook("onRequest", async (request) => {
    requestStarts.set(request, performance.now());
  });
  app.addHook("onResponse", async (request) => {
    const started = requestStarts.get(request);
    metrics.samples.push(started === undefined ? 0 : performance.now() - started);
    if (metrics.samples.length > 200) metrics.samples.shift();
  });

  await app.register(helmet, {
    hsts: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        styleSrcAttr: ["'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
  });
  await app.register(cors, {
    origin: (origin, callback) => {
      const allowed = getSetting("public_origin") ?? config.publicOrigin;
      callback(null, !origin || origin === allowed);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    allowList: () => {
      const until = getSetting("rate_limit_bypass_until");
      return Boolean(until && new Date(until).getTime() > Date.now());
    },
  });

  await app.register(publicRoutes, { prefix: "/api" });
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(async (instance) => adminRoutes(instance, metrics), { prefix: "/api/admin" });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, requestId: request.id }, "request failed");
    const candidate = typeof error === "object" && error !== null && "statusCode" in error ? error.statusCode : undefined;
    const status = typeof candidate === "number" && candidate < 500 ? candidate : 500;
    const message = error instanceof Error ? error.message : "Invalid request";
    return reply.code(status).send({
      error: status === 500 ? "internal_error" : "invalid_request",
      message: status === 500 ? "The server could not complete the request." : message,
    });
  });

  const frontendRoot = resolve(projectRoot, "build/frontend");
  if (existsSync(frontendRoot)) {
    await app.register(staticPlugin, { root: frontendRoot, prefix: "/" });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "not_found" });
      return reply.type("text/html").sendFile("index.html");
    });
  }
  return app;
}

