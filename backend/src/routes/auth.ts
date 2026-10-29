import type { FastifyInstance, FastifyReply } from "fastify";
import { config } from "../config";
import { audit, db } from "../db";
import { createConfirmationCode, createOpaqueToken, expiresIn, fiveMinutesMs, hashOneTimeSecret } from "../auth-crypto";
import { sendPasswordResetCode, sendVerificationLink } from "../mailer";
import { strictObject } from "../security";

const passwordSchema = { type: "string", minLength: 12, maxLength: 128 } as const;
const identifierSchema = { type: "string", minLength: 3, maxLength: 254 } as const;
const sessionCookie = "profit_session";
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;

type UserRow = {
  id: string;
  email: string;
  login: string;
  password_hash: string;
  email_verified_at: string | null;
  surname: string;
  given_name: string;
  patronymic: string;
};

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

function findUser(identifier: string) {
  return db.query<UserRow, [string, string]>(
    `SELECT id, email, login, password_hash, email_verified_at, surname, given_name, patronymic
     FROM users WHERE email = ? COLLATE NOCASE OR login = ? COLLATE NOCASE LIMIT 1`,
  ).get(identifier, identifier);
}

function issueSession(reply: FastifyReply, subject: string, role: "user" | "admin") {
  const token = createOpaqueToken();
  db.query("INSERT INTO sessions(id, subject, role, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(crypto.randomUUID(), subject, role, hashOneTimeSecret(token, "session"), expiresIn(sessionLifetimeMs), new Date().toISOString());
  reply.setCookie(sessionCookie, token, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: config.publicOrigin.startsWith("https://"),
    maxAge: Math.floor(sessionLifetimeMs / 1000),
  });
}

function authError(reply: FastifyReply) {
  return reply.code(401).send({ error: "invalid_credentials", message: "Неверный логин, почта или пароль." });
}

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { surname: string; givenName: string; patronymic: string; login: string; password: string } }>(
    "/register/start",
    {
      schema: {
        body: {
          type: "object", ...strictObject,
          required: ["surname", "givenName", "patronymic", "login", "password"],
          properties: {
            surname: { type: "string", minLength: 2, maxLength: 80 },
            givenName: { type: "string", minLength: 2, maxLength: 80 },
            patronymic: { type: "string", minLength: 2, maxLength: 80 },
            login: { type: "string", minLength: 3, maxLength: 32, pattern: "^[A-Za-z0-9_.-]+$" },
            password: passwordSchema,
          },
        },
      },
      config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
    },
    async (request, reply) => {
      const login = normalizeIdentifier(request.body.login);
      db.query("DELETE FROM registration_drafts WHERE expires_at <= ?").run(new Date().toISOString());
      const exists = db.query(
        "SELECT 1 FROM users WHERE login = ? COLLATE NOCASE UNION SELECT 1 FROM registration_drafts WHERE login = ? COLLATE NOCASE AND expires_at > ? LIMIT 1",
      ).get(login, login, new Date().toISOString());
      if (exists) return reply.code(409).send({ error: "login_unavailable", message: "Этот логин уже занят." });
      const passwordHash = await Bun.password.hash(request.body.password, { algorithm: "argon2id", memoryCost: 65536, timeCost: 3 });
      const id = crypto.randomUUID();
      db.query(
        "INSERT INTO registration_drafts(id, surname, given_name, patronymic, login, password_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(id, request.body.surname.trim(), request.body.givenName.trim(), request.body.patronymic.trim(), login, passwordHash, expiresIn(20 * 60 * 1000), new Date().toISOString());
      return reply.code(201).send({ registrationId: id, expiresInSeconds: 1200 });
    },
  );

  app.post<{ Body: { registrationId: string; email: string; password: string } }>(
    "/register/complete",
    {
      schema: {
        body: {
          type: "object", ...strictObject,
          required: ["registrationId", "email", "password"],
          properties: {
            registrationId: { type: "string", format: "uuid" },
            email: { type: "string", format: "email", maxLength: 254, pattern: "^[^@\\s]+@gmail\\.com$" },
            password: passwordSchema,
          },
        },
      },
      config: { rateLimit: { max: 4, timeWindow: "10 minutes" } },
    },
    async (request, reply) => {
      const draft = db.query<{
        id: string; surname: string; given_name: string; patronymic: string; login: string; password_hash: string; expires_at: string;
      }, [string]>("SELECT * FROM registration_drafts WHERE id = ?").get(request.body.registrationId);
      if (!draft || new Date(draft.expires_at).getTime() <= Date.now()) {
        return reply.code(410).send({ error: "registration_expired", message: "Регистрация истекла. Начните заново." });
      }
      if (!(await Bun.password.verify(request.body.password, draft.password_hash))) return authError(reply);
      const email = normalizeIdentifier(request.body.email);
      if (db.query("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE OR login = ? COLLATE NOCASE").get(email, draft.login)) {
        return reply.code(409).send({ error: "account_unavailable", message: "Почта или логин уже используются." });
      }
      const userId = crypto.randomUUID();
      const token = createOpaqueToken();
      const now = new Date().toISOString();
      db.transaction(() => {
        db.query(
          `INSERT INTO users(id, email, display_name, password_hash, role, created_at, surname, given_name, patronymic, login)
           VALUES (?, ?, ?, ?, 'student', ?, ?, ?, ?, ?)`,
        ).run(userId, email, `${draft.given_name} ${draft.surname}`, draft.password_hash, now, draft.surname, draft.given_name, draft.patronymic, draft.login);
        db.query("INSERT INTO email_verification_tokens(id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
          .run(crypto.randomUUID(), userId, hashOneTimeSecret(token, "email"), expiresIn(fiveMinutesMs));
      })();
      try {
        await sendVerificationLink(email, token);
      } catch (error) {
        db.query("DELETE FROM users WHERE id = ?").run(userId);
        request.log.error({ err: error }, "verification email delivery failed");
        return reply.code(503).send({ error: "mail_unavailable", message: "Не удалось отправить письмо. Попробуйте ещё раз." });
      }
      db.query("DELETE FROM registration_drafts WHERE id = ?").run(draft.id);
      audit("account.verification_sent", "user", userId);
      return reply.code(202).send({ status: "verification_sent", expiresInSeconds: 300 });
    },
  );

  app.get<{ Querystring: { token: string } }>(
    "/verify-email",
    {
      schema: { querystring: { type: "object", ...strictObject, required: ["token"], properties: { token: { type: "string", minLength: 20, maxLength: 128 } } } },
      config: { rateLimit: { max: 20, timeWindow: "5 minutes" } },
    },
    async (request, reply) => {
      const hash = hashOneTimeSecret(request.query.token, "email");
      const record = db.query<{ id: string; user_id: string; expires_at: string; login: string; email: string }, [string]>(
        `SELECT t.id, t.user_id, t.expires_at, u.login, u.email
         FROM email_verification_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? AND t.used_at IS NULL`,
      ).get(hash);
      if (!record || new Date(record.expires_at).getTime() <= Date.now()) {
        return reply.code(410).send({ error: "verification_expired", message: "Ссылка недействительна или истекла." });
      }
      const now = new Date().toISOString();
      db.transaction(() => {
        db.query("UPDATE users SET email_verified_at = ? WHERE id = ?").run(now, record.user_id);
        db.query("UPDATE email_verification_tokens SET used_at = ? WHERE id = ?").run(now, record.id);
      })();
      audit("account.email_verified", "user", record.user_id);
      return { verified: true, login: record.login, email: record.email, authenticated: false };
    },
  );

  app.post<{ Body: { identifier: string; password: string } }>(
    "/login",
    {
      schema: { body: { type: "object", ...strictObject, required: ["identifier", "password"], properties: { identifier: identifierSchema, password: passwordSchema } } },
      config: { rateLimit: { max: 6, timeWindow: "10 minutes" } },
    },
    async (request, reply) => {
      const user = findUser(normalizeIdentifier(request.body.identifier));
      if (!user || !(await Bun.password.verify(request.body.password, user.password_hash))) return authError(reply);
      if (!user.email_verified_at) return reply.code(403).send({ error: "email_unverified", message: "Сначала подтвердите почту." });
      issueSession(reply, user.id, "user");
      audit("account.login", "user", user.id);
      return { authenticated: true, role: "user", user: { login: user.login, email: user.email, name: user.given_name } };
    },
  );

  app.post<{ Body: { login: string; password: string } }>(
    "/admin/login",
    {
      schema: { body: { type: "object", ...strictObject, required: ["login", "password"], properties: { login: identifierSchema, password: { type: "string", minLength: 8, maxLength: 128 } } } },
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const validLogin = normalizeIdentifier(request.body.login) === config.adminLogin.toLowerCase();
      const validPassword = await Bun.password.verify(request.body.password, config.adminPasswordHash);
      if (!validLogin || !validPassword) return authError(reply);
      issueSession(reply, config.adminLogin, "admin");
      audit("admin.login", "administrator", config.adminLogin);
      return { authenticated: true, role: "admin" };
    },
  );

  app.post<{ Body: { identifier: string } }>(
    "/password-reset/request",
    {
      schema: { body: { type: "object", ...strictObject, required: ["identifier"], properties: { identifier: identifierSchema } } },
      config: { rateLimit: { max: 3, timeWindow: "10 minutes" } },
    },
    async (request, reply) => {
      const user = findUser(normalizeIdentifier(request.body.identifier));
      if (user?.email_verified_at) {
        const code = createConfirmationCode();
        db.query(
          `INSERT INTO password_reset_codes(user_id, code_hash, expires_at, attempts, challenge_hash, created_at)
           VALUES (?, ?, ?, 0, NULL, ?)
           ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
             attempts = 0, challenge_hash = NULL, created_at = excluded.created_at`,
        ).run(user.id, hashOneTimeSecret(code, user.id), expiresIn(fiveMinutesMs), new Date().toISOString());
        try {
          await sendPasswordResetCode(user.email, code);
        } catch (error) {
          request.log.error({ err: error }, "password reset email delivery failed");
          return reply.code(503).send({ error: "mail_unavailable", message: "Не удалось отправить письмо. Попробуйте ещё раз." });
        }
      }
      return reply.code(202).send({ status: "accepted", expiresInSeconds: 300 });
    },
  );

  app.post<{ Body: { identifier: string; code: string } }>(
    "/password-reset/verify-code",
    {
      schema: { body: { type: "object", ...strictObject, required: ["identifier", "code"], properties: { identifier: identifierSchema, code: { type: "string", pattern: "^[0-9]{6}$" } } } },
      config: { rateLimit: { max: 8, timeWindow: "10 minutes" } },
    },
    async (request, reply) => {
      const user = findUser(normalizeIdentifier(request.body.identifier));
      const record = user ? db.query<{ code_hash: string; expires_at: string; attempts: number }, [string]>("SELECT code_hash, expires_at, attempts FROM password_reset_codes WHERE user_id = ?").get(user.id) : null;
      const valid = user && record && record.attempts < 5 && new Date(record.expires_at).getTime() > Date.now()
        && record.code_hash === hashOneTimeSecret(request.body.code, user.id);
      if (!valid || !user) {
        if (user && record) db.query("UPDATE password_reset_codes SET attempts = attempts + 1 WHERE user_id = ?").run(user.id);
        return reply.code(400).send({ error: "invalid_code", message: "Код недействителен или истёк." });
      }
      const challenge = createOpaqueToken();
      db.query("UPDATE password_reset_codes SET challenge_hash = ? WHERE user_id = ?").run(hashOneTimeSecret(challenge, "reset"), user.id);
      return { verified: true, challenge };
    },
  );

  app.post<{ Body: { challenge: string; password: string; passwordConfirmation: string } }>(
    "/password-reset/complete",
    {
      schema: { body: { type: "object", ...strictObject, required: ["challenge", "password", "passwordConfirmation"], properties: { challenge: { type: "string", minLength: 20, maxLength: 128 }, password: passwordSchema, passwordConfirmation: passwordSchema } } },
      config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
    },
    async (request, reply) => {
      if (request.body.password !== request.body.passwordConfirmation) return reply.code(400).send({ error: "password_mismatch", message: "Пароли не совпадают." });
      const record = db.query<{ user_id: string; expires_at: string }, [string]>("SELECT user_id, expires_at FROM password_reset_codes WHERE challenge_hash = ?").get(hashOneTimeSecret(request.body.challenge, "reset"));
      if (!record || new Date(record.expires_at).getTime() <= Date.now()) return reply.code(400).send({ error: "reset_expired", message: "Восстановление истекло. Запросите новый код." });
      const passwordHash = await Bun.password.hash(request.body.password, { algorithm: "argon2id", memoryCost: 65536, timeCost: 3 });
      db.transaction(() => {
        db.query("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, record.user_id);
        db.query("DELETE FROM password_reset_codes WHERE user_id = ?").run(record.user_id);
        db.query("DELETE FROM sessions WHERE subject = ? AND role = 'user'").run(record.user_id);
      })();
      audit("account.password_reset", "user", record.user_id);
      return { reset: true };
    },
  );

  app.get("/session", async (request) => {
    const token = request.cookies[sessionCookie];
    if (!token) return { authenticated: false };
    const session = db.query<{ subject: string; role: "user" | "admin"; expires_at: string }, [string]>("SELECT subject, role, expires_at FROM sessions WHERE token_hash = ?").get(hashOneTimeSecret(token, "session"));
    if (!session || new Date(session.expires_at).getTime() <= Date.now()) return { authenticated: false };
    if (session.role === "admin") return { authenticated: true, role: "admin" };
    const user = db.query<{ login: string; email: string; given_name: string }, [string]>("SELECT login, email, given_name FROM users WHERE id = ?").get(session.subject);
    return user ? { authenticated: true, role: "user", user: { login: user.login, email: user.email, name: user.given_name } } : { authenticated: false };
  });

  app.post("/logout", async (request, reply) => {
    const token = request.cookies[sessionCookie];
    if (token) db.query("DELETE FROM sessions WHERE token_hash = ?").run(hashOneTimeSecret(token, "session"));
    reply.clearCookie(sessionCookie, { path: "/" });
    return reply.code(204).send();
  });
}

