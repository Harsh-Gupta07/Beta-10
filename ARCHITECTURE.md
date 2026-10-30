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
- `Ingredient` is a canonical ingredient catalog entry; `PantryItem` is a household's quantity, canonical unit, confidence/source, purchase/expiry/verification metadata. Unique `(householdId,ingredientId)` for the initial one-stock-record-per-ingredient model.
- `Recipe` belongs to a household or is seeded as shared; `RecipeIngredient` references an ingredient and stores a decimal canonical quantity per base serving.
- `MealPlan` groups a household and week; `PlannedMeal` records date, slot, recipe, servings, and status. Unique `(mealPlanId,date,slot)` prevents two active meals from occupying a slot.
- `MealIngredientAllocation` records calculated requirement per planned meal and ingredient. It is derived/rebuilt by deterministic allocation services and never changes physical stock.
- `CookingEvent` is unique per planned meal and idempotency key. `StockTransaction` is an append-only audit of purchase receipt, cooking consumption, correction, or other stock movement.
- `ShoppingList` belongs to a household; `ShoppingListItem` tracks ingredient, quantity, and purchase/receipt state. Marking purchased does not update pantry; only confirmed received quantity does.
- `InventoryVerification` records checks/corrections and their actor/time. `Notification` can record resulting meal-impact notices.

All household-owned rows carry a household relationship (directly or through a parent). Services must verify membership before reads and writes. Inventory updates, stock transaction insertion, cooking-event idempotency, and meal completion happen inside a database transaction.

## API outline (v1)

- Auth: `POST /api/v1/auth/register`, `/login`, `/logout`; `GET /auth/me`.
- Household: `GET/POST /households`, `GET/PATCH /households/:id`, `POST /households/:id/invitations`, `GET /households/:id/members`.
- Pantry: `GET/POST /households/:id/pantry`, `PATCH/DELETE /pantry/:itemId`, `POST /pantry/:itemId/verify`, `POST /pantry/:itemId/receive`.
- Recipes: `GET/POST /households/:id/recipes`, `GET/PATCH/DELETE /recipes/:recipeId`.
- Meal plans: `GET/POST /households/:id/meal-plans`, `POST /meal-plans/:id/meals`, `PATCH/DELETE /meals/:mealId`, `POST /meals/:mealId/start`, `POST /meals/:mealId/complete` with idempotency key.
- Planning: `GET /households/:id/allocations`, `GET /households/:id/shortages`; recalculation is invoked by the mutation services.
- Shopping: `GET/POST /households/:id/shopping-list/items`, `PATCH/DELETE /shopping-list/items/:itemId`, `POST /shopping-list/items/:itemId/receive`.
- Assistant: `POST /households/:id/assistant/messages`; intents are validated and actions requiring quantities/units are clarified before mutation.
- Dashboard: `GET /households/:id/dashboard`.

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

Copy `.env.example` to `.env`, set a PostgreSQL `DATABASE_URL` and a strong `SESSION_SECRET`, then run Prisma migrations. `AI_API_KEY` is optional; without it the assistant uses a clearly stated local fallback. No credentials are committed.
