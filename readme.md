# Profit Hub

Локальная платформа для курсов, тестов и командной работы с учениками. Fastify обслуживает API и собранный React frontend на одном origin.

## Команды

```bash
bun install
cp .env.example .env
bun run build
bun run start
```

Production-конфигурация загружается через `@dotenvx/dotenvx` из `.env`; единый файл ключей находится вне репозитория по пути `/root/.env.keys`.

## API

Публичные маршруты:

- `GET /api/site`, `GET /api/comments`
- `POST /api/comments`, `POST /api/requests`, `POST /api/wishes`
- `POST /api/auth/register/start`, `POST /api/auth/register/complete`
- `GET /api/auth/verify-email`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`
- `POST /api/auth/password-reset/request`, `POST /api/auth/password-reset/verify-code`, `POST /api/auth/password-reset/complete`
- `POST /api/auth/admin/login`

Администраторские маршруты требуют `Authorization: Bearer <ADMIN_API_KEY_CY>`:

- `GET /api/admin/health`, `GET /api/admin/settings`
- `GET /api/admin/submissions`, `PATCH /api/admin/submissions/:id/moderation`, `DELETE /api/admin/submissions/:id`
- `POST /api/admin/rate-limit/bypass`, `PUT /api/admin/settings/timezone`, `PUT /api/admin/settings/site-origin`
- `POST /api/admin/restart`, `POST /api/admin/backup`
- `GET /api/admin/environment`, `PUT /api/admin/environment`

## Security baseline

| Требование | Контроль | Реализация | Проверка |
|---|---|---|---|
| Валидация входа | Полные JSON Schema, запрет лишних полей | Fastify/Ajv | Негативные inject-тесты |
| Защита админских действий | Ролевая HttpOnly-сессия; служебный Bearer secret сохранён для API | `sessions`, `requireAdmin` | Проверка входа и отказ без авторизации |
| Пароли | Argon2id для пользователей, bcrypt-хеш для настроенного администратора, лимиты длины и частоты | `Bun.password` | Проверка формата хеша, регистрации и входа |
| Подтверждение почты | Одноразовый SHA-256 токен на 5 минут, Gmail SMTP | `email_verification_tokens`, Nodemailer | Подтверждение не создаёт сессию |
| Сброс пароля | Шестизначный код на 5 минут, лимит попыток, отдельный challenge | `password_reset_codes` | Неверные/просроченные коды отклоняются |
| Сессии | Случайный токен хранится только в виде SHA-256, cookie `HttpOnly`, `SameSite=Strict` | `sessions`, `@fastify/cookie` | Проверка пользовательской и админской сессии |
| SQL injection | Параметризованные prepared statements | `bun:sqlite` | Payload хранится как данные |
| Brute force / DoS | Глобальные и маршрутные лимиты, body/time limits | `@fastify/rate-limit`, Fastify | 429 и oversized-body тесты |
| XSS / browser hardening | Текстовый вывод React, CSP и security headers | `@fastify/helmet` | Проверка заголовков |
| Секреты | dotenvx, `/root/.env.keys`, маскирование ключей с `CY` | `@dotenvx/dotenvx` | Endpoint никогда не отдаёт полный secret |
| Логи | Только `logs/server.log`, redaction | Pino/Fastify | Authorization/password/value исключены |
| Резервирование | SQLite serialize каждые 12 часов и endpoint | `bun:sqlite` | Создание и размер backup |

Ограничения текущего baseline: TLS должен быть включён непосредственно в приложении либо в доверенной локальной инфраструктуре до публикации в недоверенную сеть. Флаг `Secure` для cookie активируется автоматически при HTTPS-origin. Valkey используется для health-проверки и подготовлен для будущего общего состояния; текущий rate limit рассчитан на один процесс.
