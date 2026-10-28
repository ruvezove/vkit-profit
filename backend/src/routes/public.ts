import type { FastifyInstance } from "fastify";
import { db, getSetting } from "../db";
import { strictObject } from "../security";

const submissionBody = {
  type: "object",
  ...strictObject,
  required: ["authorName", "message"],
  properties: {
    authorName: { type: "string", minLength: 2, maxLength: 80 },
    contact: { type: "string", maxLength: 160 },
    message: { type: "string", minLength: 10, maxLength: 2000 },
  },
} as const;

type SubmissionBody = { authorName: string; contact?: string; message: string };
type SubmissionType = "comment" | "request" | "wish";

export async function publicRoutes(app: FastifyInstance) {
  app.get("/site", async () => ({
    origin: getSetting("public_origin") ?? process.env.PUBLIC_ORIGIN ?? "http://localhost:3000",
  }));

  app.get("/comments", async () => {
    const comments = db.query(
      `SELECT id, author_name AS authorName, message, created_at AS createdAt
       FROM submissions
       WHERE type = 'comment' AND status = 'approved'
       ORDER BY created_at DESC LIMIT 24`,
    ).all();
    return { comments };
  });

  const createSubmission = (type: SubmissionType) => async (request: { body: SubmissionBody }, reply: { code: (status: number) => { send: (payload: object) => unknown } }) => {
    const id = crypto.randomUUID();
    db.query(
      "INSERT INTO submissions(id, type, author_name, contact, message, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
    ).run(id, type, request.body.authorName.trim(), request.body.contact?.trim() || null, request.body.message.trim(), new Date().toISOString());
    return reply.code(202).send({ id, status: "pending" });
  };

  app.post<{ Body: SubmissionBody }>("/comments", { schema: { body: submissionBody }, config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, createSubmission("comment"));
  app.post<{ Body: SubmissionBody }>("/requests", { schema: { body: submissionBody }, config: { rateLimit: { max: 4, timeWindow: "5 minutes" } } }, createSubmission("request"));
  app.post<{ Body: SubmissionBody }>("/wishes", { schema: { body: submissionBody }, config: { rateLimit: { max: 4, timeWindow: "5 minutes" } } }, createSubmission("wish"));

  app.post<{ Body: { email: string; displayName: string; password: string } }>(
    "/auth/register",
    {
      schema: {
        body: {
          type: "object",
          ...strictObject,
          required: ["email", "displayName", "password"],
          properties: {
            email: { type: "string", format: "email", maxLength: 254 },
            displayName: { type: "string", minLength: 2, maxLength: 80 },
            password: { type: "string", minLength: 12, maxLength: 128 },
          },
        },
      },
      config: { rateLimit: { max: 3, timeWindow: "10 minutes" } },
    },
    async (request, reply) => {
      const email = request.body.email.trim().toLowerCase();
      const exists = db.query("SELECT 1 FROM users WHERE email = ?").get(email);
      if (exists) {
        return reply.code(409).send({ error: "registration_unavailable", message: "Registration could not be completed." });
      }
      const passwordHash = await Bun.password.hash(request.body.password, {
        algorithm: "argon2id",
        memoryCost: 65536,
        timeCost: 3,
      });
      const id = crypto.randomUUID();
      db.query("INSERT INTO users(id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(id, email, request.body.displayName.trim(), passwordHash, new Date().toISOString());
      return reply.code(201).send({ id, displayName: request.body.displayName.trim() });
    },
  );
}

