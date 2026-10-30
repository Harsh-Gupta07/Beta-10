# KitchenSync Phase 1 — Architecture

## Product and first release

KitchenSync coordinates a household's pantry, planned meals, ingredient needs, shopping, and actual consumption. Its primary workflow is **Plan → Allocate → Detect shortages → Shop → Cook → Deduct → Verify**. The core value is reliable stock and recovery when the recorded stock is wrong; recipe discovery and AI support that workflow.

Phase 1 targets a responsive web application for a shared household. Multiple authenticated members can work with the same household data. The initial release includes pantry, recipes, weekly planning, deterministic ingredient allocation, shortages, shopping, cooking completion, stock verification, and an AI assistant with a non-AI fallback. Live retailer checkout, receipt OCR, IoT, and predictive waste analytics are out of scope.

## Stack

- Frontend: React, Vite, TypeScript, Tailwind CSS, React Router, Axios, Lucide.
- Backend: Node.js, Express, TypeScript, REST API, Zod validation.
- Data: PostgreSQL, Prisma migrations and ORM.
- Authentication: password hashing and secure, HTTP-only session cookies; every household operation is scoped through membership authorization.
- AI: server-side provider adapter configured with environment variables. Core arithmetic and mutations remain deterministic backend code; missing AI configuration returns a useful fallback.

## Runtime boundaries

The browser calls the versioned REST API and never talks to PostgreSQL or an AI provider directly. Express routes validate and authorize requests, then delegate to domain services. Services own calculations and transactional mutations. Prisma is the persistence boundary. Quantities are decimal values in canonical units (g, ml, count); conversions are only allowed within compatible unit families or through explicit ingredient-specific conversions.

```text
React UI → REST routes → validation/auth → domain services → Prisma → PostgreSQL
                                             ↘ AI adapter (optional)
```

## Proposed folders

```text
client/src/{app,components,features,lib,styles}
server/src/{config,middleware,routes,services,lib}
server/prisma/{schema.prisma,seed.ts,migrations}
docs/ (product and implementation notes)
```

## Data model and relationships

- `User` has credentials and profile data.
- `Household` owns household settings and shared operational data.
- `HouseholdMember` joins users to households with a role; unique `(householdId,userId)` prevents duplicate membership.
- `Ingredient` is a catalog entry with a canonical unit (`g`, `ml`, `count`). Global entries have no household; custom entries belong to one household and are unique per household by lower-cased name (`nameKey`). `PantryItem` is a household's quantity, canonical unit, confidence/source, purchase/expiry/verification metadata. Unique `(householdId,ingredientId)` for the initial one-stock-record-per-ingredient model.
- `Recipe` belongs to a household or is seeded as shared; `RecipeIngredient` references an ingredient and stores the decimal canonical quantity for the recipe's `baseServings`, plus a prep note and display position. Scaling multiplies by `servings / baseServings` in decimal; counts round up.
- `MealPlan` groups a household and week; `PlannedMeal` records date, slot, recipe, servings, and status. Unique `(mealPlanId,date,slot)` prevents two active meals from occupying a slot.
- Allocation is computed, not stored: `allocate()` is a pure function over current pantry stock and the meals that reserve stock (PLANNED dated today or later, plus COOKING), ordered by date, slot and creation time. Recomputing on every read means no code path can leave reservations stale. The `MealIngredientAllocation` table from the original design is currently unused; it remains available if reservations ever need to be persisted (for example for reporting).
- `Household.timezone` (IANA, default `Asia/Kolkata`) defines "today" for planning and the dashboard.
- `CookingEvent` is unique per planned meal and idempotency key, and records who completed the meal. Completion locks the meal row (`SELECT … FOR UPDATE`); a completed meal returns its original result, and the unique `plannedMealId` makes a second deduction impossible at the database level. If more was used than recorded, stock goes to zero and is flagged `CHECK_NEEDED`. `StockTransaction` is an append-only audit of every stock movement (initial stock, purchase receipt, cooking consumption, correction, manual use, removal) with `delta` and `balanceAfter`. It references the ingredient directly, so history survives pantry-item deletion (`pantryItemId` is set null).
- `ShoppingList` belongs to a household; `ShoppingListItem` tracks ingredient (or free text), quantity, source (manual, shortage, assistant) and NEEDED → PURCHASED → RECEIVED state. Marking purchased does not update pantry; only a confirmed receipt does, through `receiveStock` with idempotency key `shopping:<itemId>`. A short delivery can leave the remainder on the list. Suggestions are computed live as shortages minus open list quantities.
- `InventoryVerification` records checks/corrections and their actor/time. After a stock decrease (check, recorded use), the server recomputes shortages and writes a `Notification` with a link to the affected week if planned meals now fall short.
- `Household.inviteCode` (unique, nullable) lets members join; Phase 1 keeps one household per user. Only the owner can change settings, invites and membership.
- The assistant (`services/assistant.ts`) calls Gemini over REST with function calling. Read tools return real data (pantry, recipes scaled by the server, meal plan with allocations); write tools only produce action cards (add stock, add to shopping list, recipe draft) that the user confirms through the normal API. Units like "packet" are rejected with an instruction to ask the user. On overload or rate limits the answer is retried on a fallback model, then on a deterministic offline responder.

All household-owned rows carry a household relationship (directly or through a parent). Services must verify membership before reads and writes. Inventory updates, stock transaction insertion, cooking-event idempotency, and meal completion happen inside a database transaction.

## API outline (v1)

All routes below are implemented. Household routes are prefixed `/api/v1/households/:id` and guarded by membership.

- Auth: `POST /api/v1/auth/register`, `/login`, `/logout`, `/password`; `GET/PATCH /auth/me`.
- Household: `POST /households`, `POST /households/join` (invite code), `GET/PATCH /households/:id` (PATCH owner only), `POST/DELETE /households/:id/invite-code`, `GET /households/:id/members`, `DELETE /households/:id/members/:userId`, `GET /households/:id/dashboard`.
- Notifications: `GET …/notifications`, `POST …/notifications/read`.
- Verification: `GET …/verification` (prioritised queue with reasons).
- Ingredients (implemented): `GET/POST /households/:id/ingredients`. Global catalog plus household-private custom ingredients.
- Pantry (implemented): `GET/POST /households/:id/pantry`, `PATCH/DELETE /households/:id/pantry/:itemId`, `POST …/pantry/:itemId/use`, `POST …/pantry/:itemId/verify` (`confirm` | `update` | `finished`), `GET …/pantry/:itemId/transactions`, `POST …/pantry/receive` (confirmed arrival, optional idempotency key). Item routes are nested under the household so the membership middleware guards every call; services also filter by `householdId`.
- Recipes (implemented): `GET/POST /households/:id/recipes`, `GET /households/:id/recipes/:recipeId?servings=N` (scaled lines plus on-hand pantry comparison), `PUT/DELETE …/recipes/:recipeId` (household-owned only; 403 for built-in), `POST …/recipes/:recipeId/duplicate`.
- Planner (implemented): `GET /households/:id/planner?week=YYYY-MM-DD` (week's meals with per-line required/allocated/shortage, per-ingredient stock positions, shortages), `GET …/shortages`, `POST …/meals`, `PATCH …/meals/:mealId` (recipe, servings, date, slot), `POST …/meals/:mealId/cancel`.
- Cooking: `GET …/meals/:mealId/cooking`, `POST …/meals/:mealId/start`, `POST …/meals/:mealId/stop`, `POST …/meals/:mealId/complete` (`idempotencyKey` UUID + actual usage lines).
- Shopping: `GET …/shopping` (items + live suggestions), `POST …/shopping/items`, `POST …/shopping/add-shortages`, `PATCH/DELETE …/shopping/items/:itemId`, `POST …/shopping/items/:itemId/receive` (`keepRemainder` for partial deliveries), `POST …/shopping/clear-received`.
- Assistant: `GET …/assistant` (configured, model), `POST …/assistant/messages` (`message`, recent `history`) → `{ mode: 'ai' | 'fallback', reply, actions }`.

## Screen and component plan

- Responsive app shell: desktop sidebar, mobile navigation, household selector, page header, feedback/toast area.
- Dashboard: today's meals, upcoming shortages, low/uncertain stock, shopping summary, recent activity, quick actions.
- Meal Planner: week navigation, breakfast/lunch/dinner slots, meal editor, servings override, shortage indicators.
- Recipes: searchable catalogue, detail/scaled ingredients, reviewed custom recipe form.
- Pantry: search/category filters, stock status, add/edit, receive, verify/correct flows.
- Shopping List: generated and manual items, quantity edits, received quantity confirmation, copy/share handoff.
- AI Assistant: chat and structured clarification/review cards; usable fallback when provider is not configured.
- Household & Settings: household profile, serving defaults, members/invitations, profile/session.
- Contextual dialogs: cooking mode, shortage details, stock verification, meal change preview.

## Milestones

1. Foundation: repository setup, app shell/design tokens, API skeleton, PostgreSQL/Prisma schema, environment validation, auth and household access, dashboard shell, setup docs.
2. Pantry: CRUD, transactions, canonical units, stock confidence and verification.
3. Recipes: structured recipes and 12–15 reviewed Indian seed recipes.
4. Meal planning and deterministic allocation/shortage calculation.
5. Cooking completion with transactional, idempotent stock deduction.
6. Shopping list and confirmed-receipt stock updates.
7. Stock verification recovery flow and affected-meal messaging.
8. AI assistant adapter, confirmations, and graceful fallback.
9. End-to-end responsive polish and verification of the complete demo journey.

## Risks and controls

- Stock drift: expose confirmed/estimated/check-needed state and verify only consequential items.
- Unit ambiguity: reject unsafe cross-unit conversion; ask for clarification.
- Duplicate completion/concurrency: unique event key, database transaction, and atomic stock update.
- Household data leaks: membership checks in every service, not only client routes.
- Missing local services/secrets: validate configuration at startup and document setup; app core stays usable without AI.
- Decimal arithmetic: use Prisma Decimal/PostgreSQL numeric and avoid JavaScript floating-point for persisted quantities.
- Shopping state confusion: distinguish purchased from physically received.

## Initial configuration required

Copy `server/.env.example` to `server/.env`, set a PostgreSQL `DATABASE_URL` and a strong `SESSION_SECRET`, then run Prisma migrations. `AI_API_KEY` is optional; without it the assistant uses a clearly stated local fallback. No credentials are committed.
