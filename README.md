# KitchenSync (Beta-10)

KitchenSync is a responsive household kitchen assistant that keeps meal plans, pantry stock, shopping and real consumption connected. The Phase 1 flow is **Plan → Allocate → Detect shortage → Shop → Cook → Deduct → Verify**, and every module feeds the next.

## Phase 1 status

All ten Phase 1 modules are implemented and covered by automated tests (47 tests, including the brief's end-to-end integration journey).

| Module | What you can do |
| --- | --- |
| Accounts & household | Register, sign in, profile and password; create a household or join one with an invite code; owner manages name, usual servings, timezone, invites and members |
| Pantry | Add, edit, delete, search and filter stock in g/kg, ml/L or pcs; confidence (Confirmed / Estimated / Check needed), low-stock alerts, purchase and expiry dates, full stock history |
| Recipes | 15 built-in Indian recipes plus your own; search, categories, "Ready to cook", scaling to any servings, copy a built-in recipe to edit it |
| Meal planner | Breakfast, lunch and dinner for each day; add, change, move, re-serve and cancel meals |
| Allocation engine | Reserves on-hand stock for meals in date order; tracks on hand, allocated, unallocated and shortage; planning never deducts stock |
| Shortages | Missing ingredient, required / available / short quantity, affected meals, first affected meal and date; one tap to add to the shopping list |
| Cooking | Start cooking, confirm what was actually used, complete; stock is deducted exactly once, even with double clicks or two people completing at the same moment |
| Shopping list | Live suggestions from shortages, manual items, quantity edits, purchased tick, confirmed receipt (only this increases stock), partial deliveries, copy and share |
| Stock verification | Prioritised "Quick stock check" of uncertain items that upcoming meals depend on; quick actions; automatic recalculation and notifications when a plan is affected |
| AI assistant | Chat powered by Google Gemini; answers from your real data; any change is a card you confirm; works in a basic offline mode without a key |

## How the important rules are enforced

- **Planning never deducts stock.** Allocations are computed from current data on every read (`server/src/services/allocation.ts`), so they are never stale and never touch the pantry.
- **Only confirmed receipts increase stock.** Marking a shopping item purchased is bookkeeping; `receiveStock` is the only path that adds purchased stock, and its idempotency key makes a repeated receipt impossible.
- **Cooking deducts once.** Completion locks the meal row, returns the original result if the meal is already completed, and `CookingEvent.plannedMealId` is unique in the database. Each deduction is a `COOKING_CONSUMPTION` stock transaction.
- **Stock never goes negative.** If more was used than recorded, stock goes to 0 and is flagged *Check needed*.
- **Decimal quantities only.** PostgreSQL `numeric(12,3)` in each ingredient's canonical unit (`g`, `ml`, `count`); conversions only within a family (kg→g, L→ml); "ml of rice" is rejected.
- **Household isolation.** Every route is scoped by membership on the server; other households get 404.
- **AI never owns the numbers.** Gemini interprets language and explains. Scaling, allocations, shortages and stock changes come from the tested services, and the assistant can only propose changes that you confirm.

## Requirements

- Node.js 20 or newer and npm
- PostgreSQL 15 or newer
- Optional: a Google Gemini API key for the AI assistant

## Local setup

1. Copy `server/.env.example` to `server/.env` and set `DATABASE_URL` and a random `SESSION_SECRET` of at least 32 characters. The file lives in `server/` because both the API and the Prisma CLI run from that folder.
2. Create a PostgreSQL role and database for the app (the role needs `CREATEDB` so `prisma migrate dev` can create its shadow database):

   ```sql
   CREATE ROLE kitchensync LOGIN CREATEDB PASSWORD 'choose-a-password';
   CREATE DATABASE kitchensync OWNER kitchensync;
   ```

3. Install dependencies with `npm install`.
4. Apply the committed migrations (this also generates Prisma Client) with `npm run db:migrate`.
5. Seed the ingredient catalog and the 15 recipes with `npm run db:seed`.
6. Start client and API with `npm run dev`, then open `http://localhost:5173`.

After pulling new changes, run `npm run db:migrate` and `npm run db:seed` again.

The client calls the API through Vite's `/api` proxy, so the app works when opened via `localhost`, `127.0.0.1` or your LAN IP (handy for testing on a phone).

## AI assistant setup (optional)

1. Create a key at [Google AI Studio](https://aistudio.google.com) → **Get API key**.
2. Put it in `server/.env` as `AI_API_KEY=...` (never commit it, never paste it in chats or screenshots) and restart the API.
3. Settings → *AI assistant* shows whether it is connected.

`AI_MODEL` (default `gemini-2.5-flash`) is used first. If it is overloaded, rate-limited or slow, the whole answer is retried once on `AI_FALLBACK_MODEL` (default `gemini-flash-lite-latest`). If both fail, or no key is set, the assistant answers simple questions ("what can I cook?", "what am I short of?") from your data in an offline mode, and the rest of the app is unaffected.

The free tier allows only a few requests per minute, and one question can take 2–3 requests when the assistant looks up data. Only ingredient names, quantities, recipe and meal information, and your message are sent to Google; account details are not.

## Tests

`npm test` runs 47 tests against a real PostgreSQL database: unit conversion, scaling, the allocation engine (including the brief's rice example), pantry, recipes, planner, cooking (double and simultaneous completion), shopping (partial delivery, double receipt), verification and notifications, household invites and permissions, the assistant's offline mode and ingredient matching, and the brief's full integration journey (`server/src/routes/journey.test.ts`).

1. Create a second database, e.g. `CREATE DATABASE kitchensync_test OWNER kitchensync;`
2. Set `TEST_DATABASE_URL` in `server/.env`. Its name must contain `test`; the runner refuses anything else.
3. `npm test` applies migrations and the seed to that database, then runs the tests. Tests create uniquely named users, so the database never needs wiping. `AI_API_KEY` is blanked during tests, so they never spend API quota.

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | No | Runtime mode; defaults to development |
| `PORT` | No | API port; defaults to 4000 |
| `CLIENT_ORIGIN` | No | Allowed browser origin; defaults to Vite's local URL |
| `DATABASE_URL` | Yes | PostgreSQL connection used by Prisma and the session store |
| `SESSION_SECRET` | Yes | Secret used to sign session cookies (32+ characters) |
| `AI_API_KEY` | No | Google Gemini API key; without it the assistant runs in offline mode |
| `AI_MODEL` | No | Main Gemini model; default `gemini-2.5-flash` |
| `AI_FALLBACK_MODEL` | No | Model tried when the main one is unavailable; default `gemini-flash-lite-latest` |
| `TEST_DATABASE_URL` | For tests | Separate database used by `npm test` |

## Project layout

```text
client/src/features/   One folder per product area: auth, household, dashboard, pantry, recipes,
                       planner, cooking, shopping, verification, assistant, settings
client/src/components/ Shared UI: app shell, notification bell, modal, badges, empty/loading/error states
client/src/lib/        API client and types, formatting helpers, session context
server/src/routes/     Express routers: validation and HTTP only (plus *.test.ts API tests)
server/src/services/   Domain logic: pantry, recipes, planner, allocation, cooking, shopping,
                       verification, notifications, household, assistant, units, dates
server/prisma/         PostgreSQL schema, migrations, seed script and recipe data
server/scripts/        Test runner
ARCHITECTURE.md        Domain model, API, design decisions and risks
```

## Out of scope for Phase 1

Live grocery integrations (Blinkit, Zepto, Swiggy), barcode scanning, receipt OCR, IoT and predictive analytics. Shopping uses a manual hand-off: copy or share the list, then confirm what arrived.
