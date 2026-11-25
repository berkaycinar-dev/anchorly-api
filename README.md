**🌐 Language / Dil:** English | [Türkçe](README.tr.md)

# Anchorly API

[![CI](https://github.com/berkaycinar-dev/anchorly-api/actions/workflows/ci.yml/badge.svg)](https://github.com/berkaycinar-dev/anchorly-api/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Drizzle](https://img.shields.io/badge/ORM-Drizzle-C5F74F?logo=drizzle&logoColor=black)
![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)

The REST API behind [Anchorly](https://github.com/berkaycinar-dev/Anchorly), a task and habit dashboard. It stores each user's tasks, daily routines, projects and settings in PostgreSQL so they can follow the user across devices.

> **Status:** the data API, accounts and sign-in are complete and tested. The frontend is connected, and the API is deployed on Render with PostgreSQL on Neon. Email delivery with Resend works in test mode; sending to every user needs a verified domain.

---

## Features

**Accounts**

- **Sign up and sign in** with email and password. Passwords are hashed with Argon2id.
- **Short-lived access tokens** (JWT, 15 minutes) and **rotating refresh tokens** (30 days, sliding). Reusing an old refresh token signs that device out, unless it comes back within 5 minutes of the refresh (a lost response, for example); then it is accepted once more.
- **Web and mobile:** browsers keep the refresh token in an `HttpOnly` cookie; the mobile app receives it in the body (see [Authentication](#authentication)).
- **Email verification and password reset** with single-use links that expire (24 hours and 1 hour). Resetting the password signs out every device.
- **Account management:** change the display name, password and email address (confirmed with a link sent to the new address; the old address is told about the change), list active sessions and sign out one or all other devices, download all data as JSON, delete the account.
- **Breached passwords are refused:** new passwords are checked against [Have I Been Pwned](https://haveibeenpwned.com/Passwords) with k-anonymity, so only the first 5 characters of the SHA-1 hash leave the server. If the service cannot be reached, the check is skipped and logged.
- **Terms acceptance:** sign-up requires `acceptTerms: true` and stores the server's terms version (`src/constants/legal.js`) with the time. The user object has `termsAccepted`; when the version changes it turns `false` and `POST /me/terms` records the new acceptance.
- **Rate limits** on sign-in, sign-up, token, password and email endpoints, counted per address and, where it matters, per email or per user, plus 600 requests per 15 minutes per user on every data endpoint. Counters are stored in PostgreSQL, so they survive restarts.

**Data**

- **Settings:** theme, language, font and week start, changed one field at a time.
- **Projects:** create, rename and delete. Deleting a project detaches its tasks in the same transaction.
- **Routines:** kept in display order by the server, with a check per routine and day.
- **Tasks:** the same shape the frontend uses (`date: ""` for no date, `order`, steps), with drag-and-drop ordering and a bulk endpoint that runs create, update and delete operations in one transaction.
- **Client-generated ids:** the frontend creates UUIDs offline. Sending the same create request twice returns the existing record instead of a duplicate.
- **Soft delete:** deleted rows keep a `deleted_at` time for 30 days, then a daily cleanup removes them for good, together with expired sessions, email links and rate limit counters.

**Everywhere**

- **Strict validation:** every request body is checked with Zod. Unknown fields are rejected, so a typo never disappears silently.
- **One error shape:** `{ "error": { "code", "message", "details" } }` for every failure. Internal errors never leak details.
- **Security headers:** `helmet` on every response. API responses get a strict `default-src 'none'` policy; `/docs` keeps the default one so Swagger UI can load.
- **Structured logs:** one JSON line per request (method, path without the query, status, time) with an `X-Request-Id` that is also sent back. Headers, bodies, cookies and IP addresses are never logged, and passwords and tokens are redacted. `/ping` and `/health` stay quiet.
- **Interactive documentation:** OpenAPI 3 at `/docs`, generated from the same Zod schemas that validate requests.

---

## Design decisions

| Topic           | Decision                                                           | Why                                                                                          |
| --------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Primary keys    | `(user_id, id)` on user data                                       | Two users can import the same demo ids, and a task can never point to another user's project |
| Task steps      | `jsonb` column                                                     | Steps are always read and written with their task                                            |
| Task order      | `bigint`                                                           | The frontend uses `Date.now()` for new tasks                                                 |
| Allowed values  | `text` + `CHECK` + Zod, from one list in `src/constants`           | The database and the API can never disagree                                                  |
| Routine checks  | Unchecking keeps the row with `checked = false`                    | The change can be synced like any other update                                               |
| Locale          | Databases use the built-in `C.UTF-8` locale                        | `lower('I')` is `i` on every machine, including Turkish Windows                              |
| Refresh tokens  | Random, stored only as a SHA-256 hash                              | A leaked database cannot be used to sign in                                                  |
| Sessions        | Checked in the database on every request                           | Signing out or deleting the account takes effect at once, not after the access token expires |
| Email links     | Token in the URL fragment (`#token=`), sent to the API with `POST` | The token never reaches server logs, and email scanners cannot use it up by opening the link |
| Forgot password | Always `202`, the work runs after the response                     | The answer and its timing never reveal whether an email is registered                        |

---

## Authentication

1. `POST /auth/register` or `POST /auth/login` returns the user, an **access token** and its lifetime.
2. Send the access token as `Authorization: Bearer <token>` to every endpoint except `/health` and `/auth/*`.
3. When it expires (`401`), call `POST /auth/refresh` to get a new pair. The old refresh token stops working.

| Client            | How the refresh token travels                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser (default) | `anchorly_refresh` cookie: `HttpOnly`, `Secure`, `SameSite=Strict`, limited to `AUTH_COOKIE_PATH`. It never appears in a response body        |
| Mobile app        | Send `X-Anchorly-Client: mobile` when signing in. The token comes in the body and goes back in the body of `/auth/refresh` and `/auth/logout` |

Emails link to the frontend (`APP_URL/verify-email#token=…`, `APP_URL/reset-password#token=…`, `APP_URL/confirm-email#token=…`). See [Email delivery](#email-delivery) for how they are sent.

---

## Email delivery

Verification and password reset emails are sent with [Resend](https://resend.com) over HTTPS.

- **Development and tests:** `MAIL_PROVIDER=console` prints each email, with its link, to the server console. Nothing is sent.
- **Production:** `MAIL_PROVIDER=resend`, with `RESEND_API_KEY` and `MAIL_FROM` set in the host settings (Render). The key is never committed.
- **Failures are safe:** if Resend rejects an email, sign-up still succeeds and the reason is written to the server log (for example `Resend rejected the email with status 403: ...`). `POST /auth/resend-verification` answers `503 EMAIL_NOT_SENT`.

**Current state:** sending works in Resend's test mode. The test sender `onboarding@resend.dev` delivers only to the address of the Resend account owner. Other people get no email, and the rejection is logged. Users do not need a Resend account; only the owner of the API key does.

**To email every user:**

1. Own a domain.
2. In Resend, add the domain (region Ireland, the closest to Render in Frankfurt), add the SPF and DKIM DNS records at the domain provider, then verify it.
3. Set `MAIL_FROM` to an address on that domain, for example `Anchorly <no-reply@your-domain>`. No code change is needed.

**Why not Gmail or plain SMTP:**

- Free Render web services block outbound SMTP ports 25, 465 and 587 (since September 2025), so any SMTP login, Gmail included, times out. A paid instance, from about 7 dollars a month, lifts the block.
- Gmail would send from a personal address, allows about 500 messages a day, and its app password stops working when the account password changes.
- Resend works over HTTPS (port 443), which Render does not block.

---

## Tech stack

- Node.js 22 and Express 5 (JavaScript, ES modules)
- PostgreSQL 17 with Drizzle ORM and Drizzle Kit migrations
- Zod 4 for validation and for the OpenAPI document
- Argon2id (`@node-rs/argon2`), JWT (`jose`), `express-rate-limit`, Resend for email
- Vitest and Supertest against a real test database
- ESLint, Prettier and GitHub Actions

---

## Getting started

### 1. Requirements

- Node.js 22
- PostgreSQL 17

On Windows with a Turkish system locale, the PostgreSQL installer may fail with `locale name "Turkish_Türkiye.1254" contains non-ASCII characters`. Create the cluster yourself with `initdb --locale=C`, then register it as a service with `pg_ctl register`.

### 2. Create the role and the databases

Connect as the `postgres` superuser (for example with `psql -U postgres`) and run:

```sql
CREATE ROLE anchorly WITH LOGIN PASSWORD 'choose_a_password';
CREATE DATABASE anchorly_dev OWNER anchorly TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8';
CREATE DATABASE anchorly_test OWNER anchorly TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8';
```

The tests refuse to touch any database whose name does not end in `_test`.

### 3. Configure and run

```bash
git clone https://github.com/berkaycinar-dev/anchorly-api.git
cd anchorly-api
npm install
cp .env.example .env
cp .env.test.example .env.test
```

In `.env` and `.env.test`, put your database password in place of `change_me`. In `.env`, also set `JWT_SECRET` to a random string of at least 32 characters, for example the output of:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Then:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000/docs, sign in with `POST /auth/login` as `dev@anchorly.local` / `devpassword`, then paste the `accessToken` into **Authorize** to try the other endpoints.

To check a running server from end to end, run `npm run smoke` in a second terminal (or `npm run smoke -- https://your-api.example.com`). Give the API's own address, such as the Render URL, not the frontend's `/api` proxy. It creates a temporary account, goes through sign-in, data, sessions and sign-out, and deletes the account again.

### Environment variables

| Variable                   | Default                              | Purpose                                                                                                                                                         |
| -------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                     | `3000`                               | Port of the server                                                                                                                                              |
| `DATABASE_URL`             | required                             | PostgreSQL connection string                                                                                                                                    |
| `TRUST_PROXY`              | empty (off)                          | Number of proxies in front of the API (`1` behind one load balancer). Needed for correct client addresses in rate limits. `true` and address lists are rejected |
| `LOG_LEVEL`                | `info`                               | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`                                                                                                  |
| `JWT_SECRET`               | required                             | At least 32 characters; signs the access tokens                                                                                                                 |
| `ACCESS_TOKEN_TTL_SECONDS` | `900`                                | Access token lifetime (60–3600)                                                                                                                                 |
| `REFRESH_TOKEN_TTL_DAYS`   | `30`                                 | Refresh token lifetime, renewed on every refresh (1–90)                                                                                                         |
| `AUTH_COOKIE_PATH`         | `/auth`                              | Path of the refresh cookie. Set it to the path the browser uses, for example `/api/auth` behind a proxy                                                         |
| `AUTH_COOKIE_SECURE`       | `true`                               | Send the refresh cookie only over HTTPS                                                                                                                         |
| `MAIL_PROVIDER`            | `console`                            | `console` prints emails, `resend` sends them                                                                                                                    |
| `MAIL_FROM`                | `Anchorly <no-reply@anchorly.local>` | Sender address                                                                                                                                                  |
| `RESEND_API_KEY`           | empty                                | Required when `MAIL_PROVIDER=resend`                                                                                                                            |
| `APP_URL`                  | `http://localhost:5173`              | Frontend address used in email links                                                                                                                            |

The server refuses to start when a value is missing or invalid, and says which one.

---

## Scripts

| Command               | What it does                                                                    |
| --------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`         | Start the server, restart it when a file changes and print readable logs        |
| `npm start`           | Start the server                                                                |
| `npm run db:generate` | Create a migration from changes in `src/db/schema`                              |
| `npm run db:migrate`  | Apply pending migrations to the database in `.env`                              |
| `npm run db:seed`     | Add the development user (`dev@anchorly.local` / `devpassword`, email verified) |
| `npm run db:create`   | Create the database in `DATABASE_URL` (used by CI)                              |
| `npm run db:cleanup`  | Remove old deleted rows and expired records now (the server also does it daily) |
| `npm run lint`        | Run ESLint                                                                      |
| `npm run format`      | Format the project with Prettier                                                |
| `npm run smoke`       | Run an end-to-end check against a running server                                |
| `npm test`            | Run all tests once                                                              |
| `npm run test:watch`  | Run tests in watch mode                                                         |

---

## API overview

| Method and path                                             | Purpose                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| `GET /ping`                                                 | Check that the API process is awake (no database)             |
| `GET /health`                                               | Check the API and the database                                |
| `POST /auth/register`, `POST /auth/login`                   | Create an account or sign in                                  |
| `POST /auth/refresh`, `POST /auth/logout`                   | Get new tokens, sign out of this session                      |
| `POST /auth/verify-email`, `POST /auth/resend-verification` | Verify the email address, send a new link                     |
| `POST /auth/forgot-password`, `POST /auth/reset-password`   | Ask for a reset link, choose a new password                   |
| `GET`, `PATCH`, `DELETE /me`                                | Read the account, change the display name, delete the account |
| `POST /me/password`                                         | Change the password and sign out other devices                |
| `POST /me/email`                                            | Send a confirmation link to a new email address               |
| `POST /me/terms`                                            | Accept the current terms of use                               |
| `POST /auth/confirm-email-change`                           | Switch to the new email address with the link's token         |
| `GET`, `DELETE /me/sessions`                                | List active sessions, sign out every other device             |
| `DELETE /me/sessions/{id}`                                  | Sign out one session                                          |
| `GET /me/export`                                            | Download all data as a JSON file (verified email required)    |
| `GET`, `PATCH /me/settings`                                 | Read and change settings                                      |
| `GET`, `POST /projects`                                     | List and create projects                                      |
| `PATCH`, `DELETE /projects/{id}`                            | Rename and delete a project                                   |
| `GET`, `POST /routines`                                     | List and create routines                                      |
| `GET /routines/checks`                                      | List the checks of active routines                            |
| `PATCH`, `DELETE /routines/{id}`                            | Rename and delete a routine                                   |
| `PUT /routines/{id}/checks/{date}`                          | Check or uncheck a routine for a day                          |
| `GET`, `POST /tasks`                                        | List and create tasks                                         |
| `PATCH`, `DELETE /tasks/{id}`                               | Change and delete a task                                      |
| `POST /tasks/reorder`                                       | Save the order after drag and drop                            |
| `POST /tasks/bulk`                                          | Run several task operations in one transaction                |

The full description, with every field and error, is at `/docs` and `/openapi.json`.

---

## Tests

- Tests run against a real PostgreSQL database (`anchorly_test`). Migrations are applied once, and every table is emptied before each test.
- `test/isolation.test.js` tries every write endpoint against a second user's data and checks that nothing changes, down to the update times. It fails when a new table is added without being covered.
- `test/requireAuth.test.js` sends a request without a token to every documented protected endpoint.
- `test/openapi.test.js` fails when a route is missing from the documentation, or when a response no longer matches its documented shape.
- `test/rateLimits.test.js` and `test/trustProxy.test.js` check every limit, and that a client cannot get around them with a forged `X-Forwarded-For` header.
- `test/securityHeaders.test.js`, `test/breachedPassword.test.js`, `test/emailChange.test.js` and `test/cleanupService.test.js` cover the security work: headers, breached passwords, email change and cleanup. `test/terms.test.js` covers terms acceptance on sign-up and `POST /me/terms`.
- `test/smoke.test.js` runs `scripts/smoke.js` against a real server in the test process.
- GitHub Actions runs a production dependency audit, lint, formatting and all tests against PostgreSQL 17 on every push. Dependabot opens weekly update pull requests.

---

## Folder structure

```text
src/
├── constants/    allowed values, rate limits, email token lifetimes, the dev user
├── db/
│   ├── schema/   Drizzle table definitions
│   ├── client.js connection pool
│   ├── migrations.js
│   └── seedDevUser.js
├── docs/         OpenAPI document and response schemas
├── jobs/         the daily cleanup schedule
├── lib/          errors, passwords, tokens, cookies, user agent names
├── mail/         email senders (console, Resend) and message texts (TR, EN)
├── mappers/      database row ↔ frontend task shape
├── middleware/   sign-in check, verified email, rate limits, validation, errors
├── routes/       one Express router per resource
├── schemas/      Zod request schemas
├── services/     business rules and queries
├── app.js        builds the Express app
├── config.js     environment variables
└── server.js     starts the server
drizzle/          generated SQL migrations
scripts/          migrate, seed, create database, cleanup, smoke test
test/             tests and test helpers
```

---

## Known limitations

- No CORS list. In production the frontend reaches the API through a same-origin proxy, so CORS is not needed; the mobile app will need one.
- The breached password check lets a password through when Have I Been Pwned cannot be reached.
- A device that stays offline for more than 30 days can bring back a record that was deleted on another device, because the deleted row is gone by then.
- The free hosting plan sleeps after 15 minutes without requests; the first request after a pause can take up to a minute.
- Emails go out through Resend in test mode: until a domain is verified, only the Resend account owner's address receives them (see [Email delivery](#email-delivery)).
- The email sent to the old address after an email change has no undo link and no support address yet.
- File attachments are accepted and ignored. They will get their own storage.

---

## Roadmap

- [x] REST API for tasks, routines, projects and settings
- [x] OpenAPI documentation and continuous integration
- [x] Sign up, sign in, email verification, password reset, sessions, data export and account deletion
- [x] Connect the frontend, with offline changes synced later
- [ ] File attachments in object storage
- [x] Deployment (Render and Neon, blueprint in `render.yaml`)
- [x] Security hardening: headers, a general rate limit, persistent counters, breached password check, email change, daily cleanup, dependency audit
- [x] Terms acceptance recorded on sign-up, with a new acceptance when the terms change
- [ ] Email delivery to every address (needs a verified domain)

---

## License

This project was built for personal and portfolio purposes.

---

**Developer:** [berkaycinar-dev](https://github.com/berkaycinar-dev)
