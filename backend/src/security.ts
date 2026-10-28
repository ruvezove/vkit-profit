import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config";

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ") || !constantTimeEqual(header.slice(7), config.adminApiKey)) {
    return reply.code(401).send({ error: "unauthorized", message: "Administrator credentials are required." });
  }
}

export const strictObject = {
  additionalProperties: false,
} as const;

export function maskSensitiveValue(key: string, value: string) {
  if (!key.toUpperCase().includes("CY")) return value;
  if (value.length <= 6) return "******";
  return `${value.slice(0, 3)}${"*".repeat(Math.min(value.length - 6, 24))}${value.slice(-3)}`;
}

