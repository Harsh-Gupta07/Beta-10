# KitchenSync

KitchenSync is a responsive household kitchen assistant that keeps meal plans, pantry stock, shopping, and real consumption connected. The Phase 1 flow is **Plan → Allocate → Detect shortage → Shop → Cook → Deduct → Verify**.

## Current milestone

The initial foundation is in place: a React/Vite client shell, Express API, PostgreSQL/Prisma data model, database backed sessions, registration/login/logout, household creation, household membership checks, and a dashboard backed by database queries. Pantry, recipes, meal allocations, cooking, shopping workflows, and AI are staged for later milestones.

## Requirements

- Node.js 20 or newer and npm
- PostgreSQL 15 or newer

## Local setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL` and a random `SESSION_SECRET` of at least 32 characters.
2. Create a local PostgreSQL database named `kitchensync` (or adjust `DATABASE_URL`).
3. Install dependencies with `npm install`.
4. Generate Prisma Client and apply the initial schema with `npm run db:generate` and `npm run db:migrate`.
5. Seed the canonical ingredient catalog with `npm run db:seed`.
6. Start client and API with `npm run dev`.

The UI is at `http://localhost:5173`; the API health endpoint is `http://localhost:4000/api/v1/health`. AI configuration is optional; `AI_API_KEY` is not used until the assistant milestone.

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | No | Runtime mode; defaults to development |
| `PORT` | No | API port; defaults to 4000 |
| `CLIENT_ORIGIN` | No | Allowed browser origin; defaults to Vite's local URL |
| `DATABASE_URL` | Yes | PostgreSQL connection used by Prisma and session store |
| `SESSION_SECRET` | Yes | Secret used to sign secure session identifiers |
| `AI_API_KEY` | No | Reserved for the later server-side assistant integration |

## Project layout

```text
client/              React + Vite user interface
server/src/           Express routes, middleware, configuration and services
server/prisma/        PostgreSQL schema and seed script
ARCHITECTURE.md       Domain model, API plan, screens, risks and roadmap
```

## Product rules

- Meal planning allocates stock but does not deduct it.
- Only confirmed received quantities increase pantry stock.
- Cooking deductions will be transactional and idempotent.
- Household-owned data must be authorized by membership on the server.
- Stock calculations use decimal quantities and compatible canonical units.
- AI may interpret or explain; deterministic server code owns inventory math.

## Current configuration limitation

No database connection or AI credential is included in this repository. The API validates required configuration at startup. Configure PostgreSQL before starting the server; AI remains optional.
