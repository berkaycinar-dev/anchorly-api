**🌐 Language / Dil:** English | [Türkçe](README.tr.md)

# Anchorly API

[![CI](https://github.com/berkaycinar-dev/anchorly-api/actions/workflows/ci.yml/badge.svg)](https://github.com/berkaycinar-dev/anchorly-api/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Drizzle](https://img.shields.io/badge/ORM-Drizzle-C5F74F?logo=drizzle&logoColor=black)
![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)

The REST API behind [Anchorly](https://github.com/berkaycinar-dev/Anchorly), a task and habit dashboard. It stores tasks, daily routines, projects and settings in PostgreSQL so they can follow the user across devices.

> **Status:** the data API is complete and tested. Accounts and sign-in come next; until then every request acts as a fixed development user.

---

## Features

- **Settings:** theme, language, font and week start, changed one field at a time.
- **Projects:** create, rename and delete. Deleting a project detaches its tasks in the same transaction.
- **Routines:** kept in display order by the server, with a check per routine and day.
- **Tasks:** the same shape the frontend uses (`date: ""` for no date, `order`, steps), with drag-and-drop ordering and a bulk endpoint that runs create, update and delete operations in one transaction.
- **Client-generated ids:** the frontend creates UUIDs offline. Sending the same create request twice returns the existing record instead of a duplicate.
- **Soft delete:** deleted rows keep a `deleted_at` time, ready for syncing between devices.
- **Strict validation:** every request body is checked with Zod. Unknown fields are rejected, so a typo never disappears silently.
- **One error shape:** `{ "error": { "code", "message", "details" } }` for every failure. Internal errors never leak details.
- **Interactive documentation:** OpenAPI 3 at `/docs`, generated from the same Zod schemas that validate requests.

---

## Design decisions

| Topic          | Decision                                                 | Why                                                                                          |
| -------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Primary keys   | `(user_id, id)` on user data                             | Two users can import the same demo ids, and a task can never point to another user's project |
| Task steps     | `jsonb` column                                           | Steps are always read and written with their task                                            |
| Task order     | `bigint`                                                 | The frontend uses `Date.now()` for new tasks                                                 |
| Allowed values | `text` + `CHECK` + Zod, from one list in `src/constants` | The database and the API can never disagree                                                  |
| Routine checks | Unchecking keeps the row with `checked = false`          | The change can be synced like any other update                                               |
| Locale         | Databases use the built-in `C.UTF-8` locale              | `lower('I')` is `i` on every machine, including Turkish Windows                              |

---

## Tech stack

- Node.js 22 and Express 5 (JavaScript, ES modules)
- PostgreSQL 17 with Drizzle ORM and Drizzle Kit migrations
- Zod 4 for validation and for the OpenAPI document
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

Put your password into `.env` and `.env.test` in place of `change_me`, then:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000/docs to browse and try the API.

---

## Scripts

| Command               | What it does                                        |
| --------------------- | --------------------------------------------------- |
| `npm run dev`         | Start the server and restart it when a file changes |
| `npm start`           | Start the server                                    |
| `npm run db:generate` | Create a migration from changes in `src/db/schema`  |
| `npm run db:migrate`  | Apply pending migrations to the database in `.env`  |
| `npm run db:seed`     | Add the development user                            |
| `npm run db:create`   | Create the database in `DATABASE_URL` (used by CI)  |
| `npm run lint`        | Run ESLint                                          |
| `npm run format`      | Format the project with Prettier                    |
| `npm test`            | Run all tests once                                  |
| `npm run test:watch`  | Run tests in watch mode                             |

---

## API overview

| Method and path                    | Purpose                                        |
| ---------------------------------- | ---------------------------------------------- |
| `GET /health`                      | Check the API and the database                 |
| `GET`, `PATCH /me/settings`        | Read and change settings                       |
| `GET`, `POST /projects`            | List and create projects                       |
| `PATCH`, `DELETE /projects/{id}`   | Rename and delete a project                    |
| `GET`, `POST /routines`            | List and create routines                       |
| `GET /routines/checks`             | List the checks of active routines             |
| `PATCH`, `DELETE /routines/{id}`   | Rename and delete a routine                    |
| `PUT /routines/{id}/checks/{date}` | Check or uncheck a routine for a day           |
| `GET`, `POST /tasks`               | List and create tasks                          |
| `PATCH`, `DELETE /tasks/{id}`      | Change and delete a task                       |
| `POST /tasks/reorder`              | Save the order after drag and drop             |
| `POST /tasks/bulk`                 | Run several task operations in one transaction |

The full description, with every field and error, is at `/docs` and `/openapi.json`.

---

## Tests

- Tests run against a real PostgreSQL database (`anchorly_test`). Migrations are applied once, and every table is emptied before each test.
- `test/isolation.test.js` tries every write endpoint against a second user's data and checks that nothing changes, down to the update times.
- `test/openapi.test.js` fails when a route is missing from the documentation, or when a response no longer matches its documented shape.
- GitHub Actions runs lint, formatting and all tests against PostgreSQL 17 on every push.

---

## Folder structure

```text
src/
├── constants/    allowed values (themes, categories, repeat rules) and the dev user
├── db/
│   ├── schema/   Drizzle table definitions
│   ├── client.js connection pool
│   ├── migrations.js
│   └── seedDevUser.js
├── docs/         OpenAPI document and response schemas
├── lib/          HttpError
├── mappers/      database row ↔ frontend task shape
├── middleware/   validation, dev user, error handling
├── routes/       one Express router per resource
├── schemas/      Zod request schemas
├── services/     business rules and queries
├── app.js        builds the Express app
├── config.js     environment variables
└── server.js     starts the server
drizzle/          generated SQL migrations
scripts/          migrate, seed, create database
test/             tests and test helpers
```

---

## Known limitations

- No accounts yet. Every request acts as `dev@anchorly.local`.
- File attachments are accepted and ignored. They will get their own storage.
- No rate limiting or security headers yet.

---

## Roadmap

- [x] REST API for tasks, routines, projects and settings
- [x] OpenAPI documentation and continuous integration
- [ ] Sign up, sign in, email verification and account deletion
- [ ] Connect the frontend, with offline changes synced later
- [ ] File attachments in object storage
- [ ] Deployment

---

## License

This project was built for personal and portfolio purposes.

---

**Developer:** [berkaycinar-dev](https://github.com/berkaycinar-dev)
