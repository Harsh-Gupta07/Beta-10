# KitchenSync (Beta-10)

KitchenSync is a responsive household kitchen assistant that keeps meal plans, pantry stock, shopping, and real consumption connected. The Phase 1 flow is **Plan → Allocate → Detect shortage → Shop → Cook → Deduct → Verify**.

## Current status

| Milestone | Status |
| --- | --- |
| 1. Foundation: auth, households, sessions, dashboard shell | Done |
| 2. Pantry: inventory CRUD, units, confidence, stock checks, history | Done |
| 3. Recipes: library, custom recipes, serving scaling, 15 Indian recipes | Done |
| 4. Meal planner with allocation engine and shortage detection | Done |
| 5. Cooking mode with idempotent stock deduction | Next |
| 6–8. Shopping list, verification queue, AI assistant | Planned |

Navigation entries for unbuilt modules open an honest "coming soon" page.

### Recipes (Milestone 3)

- 15 shared Indian recipes (dal tadka, rajma chawal, poha, pulao, paneer bhurji, aloo paratha, khichdi, aloo gobi with roti, upma, chole, palak paneer, masoor dal, besan chilla, masala chai, egg bhurji), defined in `server/prisma/recipes.data.ts`.
- Every ingredient line references a catalog ingredient and is stored in its canonical unit, so recipes and pantry stock are directly comparable.
- Search, category filter and a "Ready to cook" filter. Each recipe shows which ingredients your pantry is short on at your usual servings. This is an on-hand comparison; reserving stock across planned meals belongs to the allocation engine.
- Scale any recipe from 1 to 50 servings. Scaling uses decimal math; piece counts (eggs, lemons) round up.
- Create, edit and delete your own recipes. Built-in recipes are read-only; "Make a copy to edit" creates a household copy.
- A recipe used by planned meals cannot be deleted.

### Meal planner, allocation and shortages (Milestone 4)

- Week view with breakfast, lunch and dinner for each day; previous/next week navigation. Add, change recipe, move, adjust servings and cancel meals. Meals can't be planned in the past; a cancelled meal's slot can be re-planned.
- "Today" follows the household's timezone (default `Asia/Kolkata`), so the planner and dashboard switch days at local midnight.
- **Allocation engine** (`server/src/services/allocation.ts`): walks every meal that reserves stock (planned from today on, or being cooked) in date and slot order and reserves on-hand stock first come, first served. It reports on hand, allocated, unallocated and shortage per ingredient, and required / reserved / short per meal. Stock is never reserved twice, and **planning never deducts pantry stock**.
- Allocations are recomputed from current data on every read, so any change to meals, servings, recipes or pantry stock is reflected immediately and can never be stale.
- **Shortages** list each missing ingredient with required, available and short quantities, the number of affected meals, and the first affected meal and date. Shown in the planner and on the dashboard.

### Pantry (Milestone 2)

- Add, edit, delete, search, category filters and views (low stock, needs check, expiring).
- Quantities are stored as PostgreSQL `numeric` in each ingredient's canonical unit (`g`, `ml` or `count`). Input accepts g/kg, ml/L or pcs. Conversions across families (for example ml of rice) are rejected.
- Stock confidence: Confirmed, Estimated or Check needed. A stock check ("Quantity is correct", "Update quantity", "Mark as finished") always sets Confirmed and records an `InventoryVerification`.
- Low-stock alerts per item, purchase/expiry dates, last-verified time and stock source.
- Every quantity change writes an append-only `StockTransaction` with the balance after the change. History is kept after an item is deleted.
- Mutations lock the pantry row (`SELECT … FOR UPDATE`) inside a transaction, so concurrent edits from household members cannot drive stock negative.
- Households can add custom ingredients; they are private to that household.

## Requirements

- Node.js 20 or newer and npm
- PostgreSQL 15 or newer

## Local setup

1. Copy `server/.env.example` to `server/.env` and set `DATABASE_URL` and a random `SESSION_SECRET` of at least 32 characters. The file lives in `server/` because both the API and the Prisma CLI run from that folder.
2. Create a PostgreSQL role and database for the app (the role needs `CREATEDB` so `prisma migrate dev` can create its shadow database):

   ```sql
   CREATE ROLE kitchensync LOGIN CREATEDB PASSWORD 'choose-a-password';
   CREATE DATABASE kitchensync OWNER kitchensync;
   ```
3. Install dependencies with `npm install`.
4. Apply the committed migrations (this also generates Prisma Client) with `npm run db:migrate`.
5. Seed the canonical ingredient catalog with `npm run db:seed`.
6. Start client and API with `npm run dev`.
7. Optional: run the test suite with `npm test` (see below).

The UI is at `http://localhost:5173`; the API health endpoint is `http://localhost:4000/api/v1/health`. AI configuration is optional; `AI_API_KEY` is not used until the assistant milestone.

## Tests

`npm test` runs unit tests (unit conversion, recipe scaling, stock status) and API integration tests (pantry CRUD, decimal precision, concurrent usage, verification, history, recipe scaling and pantry comparison, read-only built-in recipes, the spec's milk planning journey, slot rules, household isolation). The allocation engine also has unit tests for the spec's rice example and order independence against a real PostgreSQL database.

1. Create a second database, e.g. `CREATE DATABASE kitchensync_test OWNER kitchensync;`
2. Set `TEST_DATABASE_URL` in `server/.env`. Its name must contain `test`; the runner refuses anything else.
3. `npm test` applies migrations and the seed to that database, then runs the tests. Tests create uniquely named users, so the database never needs wiping.

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | No | Runtime mode; defaults to development |
| `PORT` | No | API port; defaults to 4000 |
| `CLIENT_ORIGIN` | No | Allowed browser origin; defaults to Vite's local URL |
| `DATABASE_URL` | Yes | PostgreSQL connection used by Prisma and session store |
| `SESSION_SECRET` | Yes | Secret used to sign secure session identifiers |
| `AI_API_KEY` | No | Reserved for the later server-side assistant integration |
| `TEST_DATABASE_URL` | For tests | Separate database used by `npm test` |

## Project layout

```text
client/              React + Vite user interface
client/src/features/  One folder per product area (auth, household, dashboard, pantry, recipes, planner)
client/src/components/ Shared UI: app shell, modal, badges, empty/loading/error states
server/src/routes/    Express routers: validation and HTTP only
server/src/services/  Domain logic: pantry, recipes, planner, allocation engine, units, dates
server/scripts/       Test runner
server/prisma/        PostgreSQL schema, migrations, seed script and recipe data
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
