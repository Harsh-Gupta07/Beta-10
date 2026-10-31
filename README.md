# KitchenSync (Beta-10)

KitchenSync is a household kitchen assistant for planning meals, tracking what is in your kitchen, and knowing what to buy. It keeps everything connected: **Plan → Allocate → Detect shortage → Shop → Cook → Deduct → Verify**.

You plan meals for the week. KitchenSync reserves the ingredients those meals need from your pantry, warns you early about anything you'll run short of, builds your shopping list, and updates your stock when you actually cook or receive groceries.

Status: Phase 1, Phase 2 (food preferences, What to Cook) and onboarding are built, and 113 automated tests pass.

## Contents

- [Quick start](#quick-start)
- [User guide](#user-guide)
  - [1. Create your account and household](#1-create-your-account-and-household)
  - [2. Add what's in your kitchen (Pantry)](#2-add-whats-in-your-kitchen-pantry)
  - [3. Browse and create recipes](#3-browse-and-create-recipes)
  - [4. Plan your week (Meal Planner)](#4-plan-your-week-meal-planner)
  - [5. Fix shortages with the Shopping List](#5-fix-shortages-with-the-shopping-list)
  - [6. Cook a meal](#6-cook-a-meal)
  - [7. Keep stock accurate (Quick stock check)](#7-keep-stock-accurate-quick-stock-check)
  - [8. Ask the AI Assistant](#8-ask-the-ai-assistant)
  - [9. Household & Settings](#9-household--settings)
  - [10. Dashboard and notifications](#10-dashboard-and-notifications)
  - [11. Food preferences and allergies](#11-food-preferences-and-allergies)
  - [12. What to cook (suggestions)](#12-what-to-cook-suggestions)
- [A typical week: try this first](#a-typical-week-try-this-first)
- [Key ideas to understand](#key-ideas-to-understand)
- [Troubleshooting](#troubleshooting)
- [For developers](#for-developers)

---

## Quick start

You need **Node.js 22.19+**, **PostgreSQL 15+**, and optionally a **Google Gemini API key** for the AI assistant.

```bash
git clone https://github.com/Harsh-Gupta07/Beta-10.git
cd Beta-10
npm install
```

1. **Create the database.** In PostgreSQL (for example with `psql` or pgAdmin) run:

   ```sql
   CREATE ROLE kitchensync LOGIN CREATEDB PASSWORD 'choose-a-password';
   CREATE DATABASE kitchensync OWNER kitchensync;
   ```

2. **Configure the app.** Copy `server/.env.example` to `server/.env` and fill in:
   - `DATABASE_URL`: use the password you chose above, e.g. `postgresql://kitchensync:choose-a-password@localhost:5432/kitchensync?schema=public`
   - `SESSION_SECRET`: any random text of at least 32 characters
   - `AI_API_KEY`: optional; see [AI assistant setup](#ai-assistant-setup)

3. **Set up the tables and sample data** (ingredient catalog and 15 Indian recipes):

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

4. **Start the app:**

   ```bash
   npm run dev
   ```

5. Open **<http://localhost:5173>** in your browser. To use it on your phone, open `http://<your-computer's-IP>:5173` on the same Wi-Fi.

Keep the terminal open while using the app. Press `Ctrl+C` to stop it, and run `npm run dev` to start it again.

**After pulling new changes** from GitHub, run `npm install` and then `npm run dev`. Before starting, `npm run dev` brings everything up to date by itself: it applies new database migrations, regenerates the Prisma client and refreshes the ingredient catalog and recipes (your household data is never touched). To do only that step, run `npm run db:setup`.

**Sign-in fails with a server error on a new or freshly pulled computer?** Look at the terminal running `npm run dev`. The `[setup]` lines say what's wrong: usually PostgreSQL isn't running or `DATABASE_URL` in `server/.env` is wrong. If it mentions the Prisma client, close every other terminal running KitchenSync and run `npm run dev` again.

### Continue with Google

It works out of the box: the team's Google Client ID is built in (it is public, not a secret). Three things to know:

1. **Open exactly `http://localhost:5173`.** Google only allows the addresses registered for the Client ID. `127.0.0.1`, your LAN IP (e.g. a phone on Wi-Fi) or another port are refused until they are added. The dev server will not silently move to another port; if 5173 is busy it stops with an error, so close the other app using it.
2. **Testing mode:** while the Google app is in *Testing*, only Gmail accounts listed as **test users** can sign in. The project owner adds them in Google Cloud Console → *Google Auth Platform → Audience → Test users*.
3. **New addresses** (your Render URL, a LAN IP): the project owner adds them in Google Cloud Console → *Credentials → the Web client → Authorised JavaScript origins*.

If an old `server/.env` has an empty `GOOGLE_CLIENT_ID=` line, that's fine: the built-in ID is used. Set it to `off` to hide the button.

---

## User guide

The menu (sidebar on desktop, bottom bar and ☰ menu on mobile) has ten sections: **Dashboard, What to Cook, Meal Planner, Recipes, Pantry, Shopping List, Quick Stock Check, Kitchen Assistant, Food Preferences, Household & Settings.**

### 1. Create your account and household

1. Open the app and click **Create an account**. Enter your name, email and a password of at least 10 characters.
2. Choose one:
   - **Create a household**: give it a name (e.g. "Sharma kitchen") and the number of people you usually cook for. You become the **owner**.
   - **Join with a code**: enter the invite code a family member shared from their Settings page. You'll see the same pantry, recipes, plan and shopping list as them.

Each account belongs to one household. Households never see each other's data.

### 2. Add what's in your kitchen (Pantry)

The Pantry is your record of what is **physically in your kitchen right now**.

1. Go to **Pantry** → **Add item**.
2. Search for an ingredient (e.g. "rice", "milk", "paneer"). If it's not in the list, type its name and choose **Create as a custom ingredient**, then pick how it is measured: weight, volume or pieces.
3. Enter the quantity and unit (**g / kg**, **ml / L** or **pcs**).
4. Choose **how sure you are** of the amount:
   - **Confirmed**: you measured or just bought it
   - **Estimated**: a rough guess
   - **Check needed**: you're not sure; KitchenSync will remind you to check it
5. Optional: a **low-stock alert** level (e.g. warn me below 500 g), and **purchase** and **expiry** dates.

Click any pantry item to:

- **Quantity is correct** / **Update quantity** / **Mark as finished**: a quick physical check
- **Record use**: something used outside a planned meal (e.g. "200 ml milk for guests' chai")
- **Edit details** or **Remove**
- See its full **stock history**: every change, who made it, and the balance after

Use the search box, category filter and the **Low stock / Needs check / Expiring** views to find items quickly.

> Units are converted exactly (1.5 kg = 1500 g). KitchenSync refuses conversions that don't make sense, such as "500 ml of rice".

### 3. Browse and create recipes

- **Recipes** shows 15 built-in Indian recipes plus any your household creates. Search, filter by category, or turn on **Ready to cook** to see what your pantry fully covers.
- Open a recipe to see ingredients, the method, and a **pantry check** (✓ in pantry / short by X / not in pantry).
- Use **− / +** next to the servings to **scale** quantities for any number of people.
- **New recipe**: add your own, choosing each ingredient from the list with a quantity, unit and optional note.
- Built-in recipes can't be edited. Use **Make a copy to edit** to create your own version.

### 4. Plan your week (Meal Planner)

1. Go to **Meal Planner**. Each day has **Breakfast, Lunch and Dinner**. Use the arrows to move between weeks.
2. Click **+ Add** in a slot, choose a recipe (recipes your pantry covers appear first), set the servings, and click **Plan**.
3. Click a planned meal to:
   - change the **servings** or **recipe**
   - **Move** it to another day or meal
   - **Cancel** it
   - see each ingredient as **Needed / Reserved / Short**
   - **Cook** it (see [step 6](#6-cook-a-meal))

When you plan a meal, KitchenSync **reserves** the ingredients it needs from your pantry, earliest meal first. **Nothing is removed from your pantry until you actually cook.**

If ingredients will run out, an **Upcoming shortages** panel appears at the top, showing each ingredient, how much you're short, and the first meal affected. It updates instantly when you change meals, servings or stock.

### 5. Fix shortages with the Shopping List

1. In the planner's shortage panel, click **Add shortages to shopping list**. Alternatively, open **Shopping List**, where suggestions appear automatically, and click **Add all** or add items one by one.
2. Add anything else with **Add item**: an ingredient, or free text such as "Dish soap".
3. **Copy** or **Share** the list to send it on WhatsApp or use it in your grocery app.
4. Tick an item when you've **purchased** it. This doesn't change your pantry yet.
5. When the groceries **arrive**, click **Received** and enter the quantity that actually came. Only now is it added to your pantry.
   - If less arrived, keep **"keep the rest on the list"** ticked, and the remainder stays on the list.
   - If an order was cancelled, just leave the item on the list (untick "purchased").

### 6. Cook a meal

1. In the **Meal Planner**, click the meal and press **Cook**.
2. Optionally press **Start cooking** so the family can see it's in progress.
3. Check the **Used** amounts. They're pre-filled from the recipe, so change any that were different, or set them to 0 for anything you skipped.
4. Press **Mark as cooked**. The used ingredients are deducted from your pantry and recorded in its history.

A meal can only ever be deducted **once**, even if you click twice or two family members complete it at the same time. If you used more than the pantry recorded, the item goes to 0 and is marked **Check needed**.

### 7. Keep stock accurate (Quick stock check)

Recorded stock drifts from reality: spills, snacks, guesses. The **Quick stock check** keeps it honest.

1. Open it from **Pantry → Quick stock check** or **Dashboard → Verify stock**.
2. It lists the items most worth checking first: uncertain amounts that your upcoming meals depend on. Each comes with the reasons why.
3. For each item, look in your kitchen and press **Quantity is correct**, **Update quantity** or **Mark as finished**.

After a correction, reservations, shortages and shopping suggestions update automatically. If a planned meal is now short, you get a **notification**. For example, if you correct milk from 800 ml to 300 ml and your planned meals need 700 ml, KitchenSync immediately shows a 400 ml shortage.

### 8. Ask the AI Assistant

Open **AI Assistant** and type in plain language, or tap a suggestion:

| Ask | What happens |
| --- | --- |
| "What can I cook today?" | Suggests recipes based on your real pantry |
| "Suggest dinner using potatoes and paneer" | Finds matching recipes, or offers to draft a new one |
| "How much rice do I need for five people?" | Gives exact scaled quantities |
| "Why is my dinner showing a shortage?" | Explains which ingredients are short and by how much |
| "Add two packets of milk" | Asks how much one packet is, then prepares a card |
| "I bought 1 kg potatoes" | Prepares a card to add it to your pantry |

**The assistant never changes anything on its own.** Changes appear as cards:

- **Confirm**: adds the stock or shopping items
- **Review & save**: opens an AI-drafted recipe in the recipe form so you can check it before saving
- **✕**: dismiss

All quantities and calculations come from KitchenSync itself, not from the AI. If the AI isn't set up or is busy, the assistant shows an **Offline answer** with basic information, and the rest of the app keeps working normally.

### 9. Household & Settings

- **Kitchen details** (owner only): household name, usual servings (the default for new meals and recipe checks), and timezone (decides when "today" starts).
- **Members**: see everyone in the household. The owner can remove members.
- **Invite family**: the owner creates an **invite code** to share. Others join with **Join with a code** after creating an account. The owner can make a new code (the old one stops working) or switch invites off.
- **Your profile**: change your display name or password.
- **AI assistant**: shows whether AI is connected.
- **Sign out**.

### 10. Dashboard and notifications

The **Dashboard** is your daily overview:

- today's meals and the next few upcoming meals
- counts for pantry items, low stock, upcoming shortages and recipes
- what's **running low** and **upcoming shortages**
- **recent activity** (stock added, used, cooked, corrected)
- quick actions: Add ingredient, Verify stock, Plan a meal, Add recipe, Shopping list, Ask the assistant

**Alerts for every change.** Whenever you save, add, remove, plan, cook or check something, a short confirmation appears at the bottom of the screen (errors stay longer, in red).

The **bell** 🔔 (next to your household name, or in the mobile top bar) tells you what *the rest of your household* changed: "Ravi planned Dal Tadka for dinner on Tue, 3 Nov", "Asha received Milk", "Ravi updated their diet and allergies". It also warns everyone when recorded usage or a stock correction leaves a planned meal short. Each person has their own unread count, you never get alerts about your own changes, and new members only see what happened after they joined. While the app is open the bell checks for news every 45 seconds and shows anything new as a pop-up. Click a notification to jump to the affected page.

### 11. Food preferences and allergies

Open **Food Preferences** in the menu. Each person fills in their own:

- **Firm rules**: diet (vegan, vegetarian, eggetarian or non-veg), **allergies**, and ingredients they **never use** (e.g. onion and garlic). These are shown to the whole household so whoever cooks can respect them.
- **Likes**: spice level, favourite cuisines, liked ingredients, favourite dishes and dishes they'd rather skip. These stay personal and will guide suggestions later.

The owner can also set the household's **usual cuisines and spice level**.

Every recipe then shows:

- a **Vegan / Vegetarian / Eggetarian / Non-veg** badge, worked out from its ingredients
- **"Not for …"** when it clashes with someone's allergy, diet or never-use list; the recipe page says who and why
- **"Check ingredients"** when it uses an ingredient whose allergens nobody has checked yet (spice blends such as garam masala, or your own custom ingredients)

Use **Safe for everyone** on the Recipes page to see only dishes that suit every member with fully checked ingredients. The AI Assistant also won't suggest dishes that clash.

When you add a **custom ingredient** in the Pantry, say what it is and tick its allergens. Edit the pantry item to change them later. Built-in ingredients are tagged by KitchenSync. Always check packaged products' labels; tags describe typical ingredients, not every brand.

### 12. What to cook (suggestions)

Open **What to Cook** in the menu (the top three also appear on the Dashboard, and in the planner when you add a meal). Each idea lists **why** it was picked, for example *Ready with what you have*, *Haven't had it in 12 days*, *Asha's favourite*, or a warning such as *You had this yesterday*.

Suggestions come from your own data, never from guesses:

- **Pantry**: "Ready" uses only stock that isn't already reserved for planned meals.
- **What you've eaten**: meals marked **cooked** count for everyone in the household. Untick anyone who wasn't eating under **Who's eating** on the meal. For meals you didn't cook through the planner, use **We ate this** to log them; logging never changes your pantry.
- **What people like**: favourites, dislikes, cuisines and spice limits from Food Preferences.
- Dishes that clash with anyone's allergy or diet, and drinks, are never suggested.

Switch between **Everyone** and **Just me**, or pick a meal. On each idea: **Plan it** adds it to the planner, **Not today** hides it for everyone for 3 days, **Love it** and **Don't suggest for me** update your own preferences. The AI Assistant uses the same ranking when you ask "What should we cook?".

---

## A typical week: try this first

1. **Pantry**: add milk 1 L, rice 2 kg, toor dal 500 g, onions 1 kg, and a few spices.
2. **Meal Planner**: plan Masala Chai for tomorrow's breakfast and Dal Tadka for dinner.
3. Open a meal to see what's **reserved** and what's **short**, and check the **Upcoming shortages** panel.
4. Click **Add shortages to shopping list**, then open **Shopping List** and **Share** it.
5. When groceries arrive, press **Received**. The shortages disappear.
6. On the day, open the meal → **Cook** → **Mark as cooked**. The pantry goes down by exactly what you used.
7. Once in a while, run **Quick stock check** to fix any drift.
8. Ask the **AI Assistant** "What can I cook today?"

---

## Key ideas to understand

| Term | Meaning |
| --- | --- |
| **On hand** | What your pantry says is physically in the kitchen |
| **Reserved (allocated)** | Stock set aside for upcoming planned meals, earliest meal first. It is still in your pantry. |
| **Unallocated** | On-hand stock not needed by any upcoming meal |
| **Short (shortage)** | Extra quantity you need to buy to cover every upcoming meal |
| **Confirmed / Estimated / Check needed** | How sure you are that a pantry amount is accurate |
| **Purchased vs Received** | *Purchased* is just a note. Stock increases only when you confirm what was *received*. |

### Golden rules

- Planning a meal **never** reduces your pantry. Only cooking or recorded use does.
- Only **confirmed received** groceries increase your pantry.
- A meal deducts ingredients **once**, no matter how many times "cooked" is pressed.
- Stock never goes below zero.
- The AI suggests; **you confirm**. All quantities are calculated by KitchenSync, not the AI.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Could not reach KitchenSync" or "Sign in failed" with a server status code | The API isn't running or is stale. Stop the terminal (`Ctrl+C`) and run `npm run dev` again. |
| API fails to start with a database error | PostgreSQL isn't running, or `DATABASE_URL` in `server/.env` is wrong. Start the PostgreSQL service and check the password. |
| Errors after `git pull` | Run `npm install`, `npm run db:migrate`, `npm run db:seed`, then `npm run dev`. |
| No recipes or ingredients | Run `npm run db:seed`. |
| "Meals can only be planned for today or later" | Past dates are locked. Check the household timezone in Settings. |
| Assistant shows "Offline answer" | No `AI_API_KEY` is set, the key is invalid, or the free usage limit was reached. Wait a minute or check the key. |
| "Built-in recipes can't be changed" | Use **Make a copy to edit**. |
| Can't delete a recipe | It is used by planned meals. Change or cancel those meals first. |

---

## For developers

### AI assistant setup

1. Create a key at [Google AI Studio](https://aistudio.google.com) → **Get API key**.
2. Put it in `server/.env` as `AI_API_KEY=...` and restart the API. **Never commit the key or share it in chats or screenshots.** If it leaks, delete it in AI Studio and create a new one.
3. **Settings → AI assistant** shows whether it is connected.

`AI_MODEL` (default `gemini-2.5-flash`) is tried first. If it is overloaded, rate-limited or slow, the whole answer is retried once on `AI_FALLBACK_MODEL` (default `gemini-flash-lite-latest`). If both fail, the assistant answers simple questions from your data in offline mode.

The free tier allows only a few requests per minute, and one question can take 2–3 requests. Only ingredient names, quantities, recipe and meal details and your message are sent to Google; account details are not.

### How the rules are enforced

- **Planning never deducts stock.** Allocations are computed fresh on every read by a pure function (`server/src/services/allocation.ts`), so they can't go stale and never touch the pantry.
- **Only confirmed receipts add stock.** `receiveStock` is the only path for purchased stock; its idempotency key (`shopping:<itemId>`) makes a double receipt impossible.
- **Cooking deducts once.** Completion locks the meal row; an already completed meal returns its original result; `CookingEvent.plannedMealId` is unique in the database.
- **Exact quantities.** PostgreSQL `numeric(12,3)` in each ingredient's canonical unit (`g`, `ml`, `count`); conversions only within a family.
- **Concurrency.** Stock changes run in transactions with `SELECT … FOR UPDATE`.
- **Household isolation.** Every route checks membership on the server; other households get 404.
- **Audit trail.** Every stock change is an append-only `StockTransaction` with the balance after it.
- **Suggestions are ranked, not generated.** `server/src/services/recommend.ts` is a pure scoring function; every point comes with a reason. History is read from cooked meals and manual logs (`eatingHistory.ts`), never copied, and pantry fit uses unreserved stock from the allocation engine.
- **Allergy and diet checks are never guessed.** `server/src/services/foodSafety.ts` is a pure function: a recipe's diet type and allergens come from its ingredients' tags, and an untagged or unchecked ingredient makes the answer "unknown", never "safe". It is computed on every read, so removing a member or retagging an ingredient takes effect immediately. The assistant receives the reasons without members' names.

### Tests

`npm test` runs 113 tests against a real PostgreSQL database: unit conversion and scaling, the allocation engine (including the brief's rice example), food safety and preferences, eating history and suggestions, release hardening (origin checks and rate limits, including sign-in spraying and demo assistant use), sign-in and demo kitchens, pantry, recipes, planner, cooking (double and simultaneous completion), shopping (partial delivery, double receipt), verification and notifications, invites and permissions, the assistant's offline mode, and the brief's full integration journey (`server/src/routes/journey.test.ts`).

1. Create a test database: `CREATE DATABASE kitchensync_test OWNER kitchensync;`
2. Set `TEST_DATABASE_URL` in `server/.env`. Its name must contain `test`.
3. Run `npm test`. It applies migrations and the seed, then runs the tests. Tests never need the database wiped, and `AI_API_KEY` is blanked so they never use API quota.

### Environment variables (`server/.env`)

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `SESSION_SECRET` | Yes | Signs session cookies (32+ characters) |
| `AI_API_KEY` | No | Google Gemini key; without it the assistant runs in offline mode |
| `AI_MODEL` | No | Main Gemini model (default `gemini-2.5-flash`) |
| `AI_FALLBACK_MODEL` | No | Backup model (default `gemini-flash-lite-latest`) |
| `TEST_DATABASE_URL` | For tests | Separate database for `npm test` |
| `PORT` | No | API port (default 4000) |
| `CLIENT_ORIGIN` | No | Allowed browser origin (default `http://localhost:5173`) |
| `NODE_ENV` | No | `development`, `test` or `production` |

### Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start API (port 4000) and web app (port 5173) |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:seed` | Load the ingredient catalog and 15 recipes (safe to re-run) |
| `npm test` | Run all tests |
| `npm run build` | Production build of server and client |
| `npm run build:deploy` | Deployment build: generates Prisma Client, then builds server and client |
| `npm run db:deploy` | Apply migrations in staging/production (`prisma migrate deploy`, never resets data) |
| `npm run db:seed:prod` | Seed using the compiled script (no dev tools needed) |
| `npm start` | Start the built server (`server/dist/src/index.js`) |

### Deploying to staging

See **[RELEASE-READINESS.md](RELEASE-READINESS.md)**: audit results, required environment variables (`TRUST_PROXY`, `SERVE_CLIENT`, …), database provisioning, HTTPS and cookie requirements, health checks and logging.

### Project layout

```text
client/src/features/   One folder per area: auth, household, dashboard, pantry, recipes,
                       planner, cooking, shopping, verification, assistant, settings
client/src/components/ Shared UI: app shell, notification bell, modal, badges, states
client/src/lib/        API client and types, formatting helpers, session context
server/src/routes/     Express routes: validation and HTTP (plus *.test.ts API tests)
server/src/services/   Business logic: pantry, recipes, planner, allocation, cooking,
                       shopping, verification, notifications, household, assistant
server/prisma/         Database schema, migrations, seed script and recipe data
ARCHITECTURE.md        Data model, full API list, design decisions and risks
```

### Out of scope for Phase 1

Live grocery integrations (Blinkit, Zepto, Swiggy), barcode scanning, receipt OCR, IoT devices and predictive analytics. Shopping uses a manual hand-off: share the list, then confirm what arrived.
