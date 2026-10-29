import nodemailer from "nodemailer";
import { config } from "./config";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: config.smtpUser, pass: config.smtpPassword },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
});

export async function verifySmtpConnection() {
  await transporter.verify();
}

export async function sendVerificationLink(email: string, token: string) {
  const origin = config.publicOrigin.replace(/\/$/, "");
  const link = `${origin}/verify-email?token=${encodeURIComponent(token)}`;
  await transporter.sendMail({
    from: `Profit Hub <${config.smtpUser}>`,
    to: email,
    subject: "Подтвердите почту в Profit Hub",
    text: `Перейдите по ссылке в течение 5 минут: ${link}\n\nЕсли вы не регистрировались в Profit Hub, проигнорируйте письмо.`,
    html: `<p>Подтвердите почту в Profit Hub.</p><p><a href="${link}">Подтвердить почту</a></p><p>Ссылка действует 5 минут.</p>`,
  });
}

export async function sendPasswordResetCode(email: string, code: string) {
  await transporter.sendMail({
    from: `Profit Hub <${config.smtpUser}>`,
    to: email,
    subject: "Код восстановления Profit Hub",
    text: `Код восстановления: ${code}\nКод действует 5 минут. Никому его не сообщайте.`,
    html: `<p>Код восстановления Profit Hub:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>Код действует 5 минут. Никому его не сообщайте.</p>`,
  });
}

