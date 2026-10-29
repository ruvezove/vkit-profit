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

}

