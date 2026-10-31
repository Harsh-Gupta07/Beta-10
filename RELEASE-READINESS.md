# KitchenSync – Phase 1.1 Release Readiness Audit

| | |
| --- | --- |
| Audited commit | `6c24942` (`main`, Phase 1 MVP) |
| Fix branch | `release/phase-1.1-readiness` (main was not modified) |
| Audit date | 31 Oct 2026 |
| Scope | Frontend, backend, database and migrations, auth and sessions, household authorization, AI integration, API, configuration, tests, UI/UX, deployment |
| Rule followed | No new product features; no functionality removed; every result below was produced by actually running the command or test |

## 1. Overall result

KitchenSync's domain logic was already solid (allocation, deduct-once cooking, receipts, isolation and 47 passing tests). However, it **could not have been deployed** as merged:

- The production start command pointed at a file that does not exist.
- Behind HTTPS, sign-in would silently not persist.
- There was no production build or migration path.
- There was no rate limiting.

All Critical and High findings are fixed and covered by tests. The application was then run as a real production build, served the way staging will serve it, and audited in a headless browser at desktop, tablet and mobile sizes.

**Recommendation: ready for staging and a closed beta with real households** once the [pre-launch checklist](#10-final-release-recommendation) is done. Not yet recommended for open public sign-up (see [remaining risks](#8-remaining-risks)).

| Severity | Found | Fixed | Open |
| --- | --- | --- | --- |
| Critical | 1 | 1 | 0 |
| High | 3 | 3 | 0 |
| Medium | 9 | 8 | 1 (npm advisory in Prisma CLI tooling, needs a major upgrade) |
| Low | 10 | 5 | 5 (documented) |

## 2. Build and test results

All commands were run on Windows 11, Node 22.19, npm workspaces, against PostgreSQL 18.6.

| Command | Before (main `6c24942`) | After (release branch) |
| --- | --- | --- |
| `npm install` | OK, **3 high-severity advisories** (see M-7) | OK, same 3 advisories (unchanged, see M-7) |
| `npm run build` | OK; one JS chunk 794 KB (205 KB gzip) | OK; main chunk 599 KB (178 KB gzip) plus per-page chunks |
| `npm test` | **47 / 47 passed** | **54 / 54 passed** (7 new security tests) |
| `npm start` (production) | **FAILED**: `Cannot find module …/server/dist/index.js` | OK; verified serving the built app with `NODE_ENV=production` |
| `npm run db:seed:prod` | did not exist | OK: "Seeded 48 canonical ingredients. Seeded 15 shared recipes." |
| Production login behind HTTPS proxy | **no session cookie issued** (reproduced) | `Set-Cookie: kitchensync.sid=…; HttpOnly; Secure; SameSite=Lax` |
| Browser audit, production build, 3 viewports | n/a | 0 page errors, 0 CSP violations, 0 horizontal overflow, 0 unlabeled controls, 0 HTTP 5xx in 444 requests |

On Windows, `prisma generate` cannot replace the query-engine DLL while a dev server is running (`EPERM`). For that reason `build` only compiles, and deployments use `build:deploy`, which generates the Prisma client first. This does not affect Linux hosts.

## 3. Security findings

| Area | Finding | Status |
| --- | --- | --- |
| Password hashing | bcrypt, cost 12; passwords 10–128 characters | ✅ Sound |
| Login timing | Unknown emails skipped bcrypt, so response time revealed whether an account exists | ✅ Fixed (M-9): compares against a dummy hash |
| Session fixation | Session ID regenerated on login and register; destroyed on logout | ✅ Sound |
| Session cookie | `HttpOnly`, `SameSite=Lax`, 14 days, stored in PostgreSQL. `Secure` was ineffective behind a proxy | ✅ Fixed (H-1) |
| CSRF | Relied only on `SameSite=Lax` | ✅ Fixed (M-1): writes with a foreign `Origin` are rejected with 403 |
| CORS | Single configured origin with credentials; no wildcard | ✅ Sound |
| Authentication | `requireUser` on all household and profile routes | ✅ Sound |
| Household isolation | Membership middleware on every `/households/:id/*` route, and every service also filters by `householdId`. Tested in 6 test files (pantry, recipes, planner, cooking, shopping, household): other households get 404 | ✅ Sound |
| Owner-only actions | Settings, invites and member removal return 403 for members | ✅ Sound (tested) |
| Input validation | Zod schema on every route; JSON body limit 1 MB | ✅ Sound; oversized bodies returned 500 → ✅ Fixed (M-4) |
| SQL injection | Prisma parameterised queries; raw SQL only as tagged templates (`$queryRaw`, `$executeRaw`); no `*Unsafe` calls | ✅ Sound |
| Rate limiting | None | ✅ Fixed (H-2): login, registration, invite join, AI assistant |
| Security headers | None | ✅ Fixed (M-2): `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, COOP, strict CSP on pages |
| Error exposure | 500s return a generic message; no stack traces in responses (tested) | ✅ Sound |
| Logging | Request logs contain method, path without query, status, duration, IP and user ID. No bodies, passwords or cookies | ✅ Added (M-5) |
| Secrets in the repo | `.env` is gitignored; full scan of tracked files found no API keys or credentials | ✅ Sound |
| `SESSION_SECRET` | The example placeholder was accepted in production | ✅ Fixed: rejected at startup when `NODE_ENV=production` |
| AI API key | Server-only, sent in the `x-goog-api-key` header (not the URL), never returned to the browser, blanked during tests | ✅ Sound |
| AI actions | The assistant cannot change data. Write tools only produce cards the user confirms through the normal authorised API, and confirm cards use an idempotency key | ✅ Sound |
| Prompt injection | Recipe or ingredient text could steer replies, but the model has no mutating tools and can only read the user's own household | ✅ Acceptable |
| AI cost abuse | Unlimited messages | ✅ Fixed (H-2): 10 per user per minute |
| Dependencies | `npm audit`: 3 high (deepmerge-ts via `@prisma/config`, used by the Prisma CLI) | ⚠️ Open (M-7) |
| Previously exposed key | The Gemini key was visible in a screenshot during development | ⚠️ Action: rotate before staging |

## 4. Functional testing results

Covered by automated API tests against a real PostgreSQL database, using separate users and separate households.

| Workflow | Evidence | Result |
| --- | --- | --- |
| Registration, login, logout, profile, password change | `household.test.ts`, `security.test.ts` | ✅ Pass |
| Household creation; one household per user | `security.test.ts` (second household → 409) | ✅ Pass (bug fixed, M-3) |
| Joining with an invite code; wrong code; invites off; member removed loses access | `household.test.ts` | ✅ Pass |
| Pantry: add, edit, delete, use, verify, history, units, concurrent updates | `pantry.test.ts` (12 parallel updates → never negative) | ✅ Pass |
| Recipes: create, edit, copy built-in, delete, scaling, unit validation | `recipes.test.ts` | ✅ Pass |
| Weekly planning: add, move, change, servings, cancel, re-plan, no past dates | `planner.test.ts` | ✅ Pass |
| Allocation (brief's rice example: 1000 g vs 300 + 400 + 500 → 200 g short) | `allocation.test.ts` | ✅ Pass |
| Shortage calculation and recalculation after every change | `planner.test.ts`, `journey.test.ts` | ✅ Pass |
| Cooking completion with actual usage | `cooking.test.ts` | ✅ Pass |
| Duplicate cooking: 4 simultaneous completions | `cooking.test.ts` → exactly 1 deduction, 3 × "already completed" | ✅ Pass |
| Shopping generation, merge, purchased ≠ received | `shopping.test.ts` | ✅ Pass |
| Partial delivery; double receipt | `shopping.test.ts` (remainder kept; second receipt is a no-op) | ✅ Pass |
| Stock verification queue and correction notifications | `household.test.ts` (brief's 800 → 300 ml example → 400 ml short) | ✅ Pass |
| AI assistant offline fallback; rate limit | `household.test.ts`, `security.test.ts` | ✅ Pass |
| AI assistant live (Gemini) | Manual run of all six example prompts during Phase 1 | ✅ Pass (free-tier limits apply, see R-5) |
| Brief's full 15-step integration journey | `journey.test.ts` | ✅ Pass |
| Every screen, desktop, tablet and mobile, production build | Headless Chrome audit (section 5) | ✅ Pass |

## 5. UI/UX findings

Method: headless Chrome at 1440 × 900, 820 × 1180 (touch) and 390 × 844 (mobile). It visited all 8 screens plus the recipe detail, pantry add dialog, meal sheet, cooking dialog and mobile menu. It recorded console and page errors, failed API calls, horizontal overflow and buttons or links without an accessible name, and saved full-page screenshots. The audit ran on the dev build first, then again on the production build with CSP enabled.

| ID | Finding | Severity | Status |
| --- | --- | --- | --- |
| M-6 | On mobile, the cooking dialog hid its column headers, so "400 ml" and "700 ml" appeared without saying which was the recipe and which was pantry stock. A user could confirm the wrong usage | Medium | ✅ Fixed: each value is labelled *Recipe / In pantry / Used* on small screens |
| M-8 | Production error messages told users to "restart `npm run dev`" | Medium | ✅ Fixed: developer hint only in dev builds; clear 429 message |
| L-1 | Warning icons in headings rendered on their own line (Tailwind preflight makes `svg` block-level) | Low | ✅ Fixed |
| L-2 | No favicon: a 404 on every page load | Low | ✅ Fixed (inline SVG) |
| L-5 | Muted text contrast 4.1:1, below WCAG AA (4.5:1) | Low | ✅ Fixed: 5.1:1 |
| L-7 | Dialogs set initial focus and close on Escape but don't trap Tab focus | Low | Open |
| L-8 | The pre-login session check (`GET /auth/me` → 401) shows as a console error | Low | Open (cosmetic) |
| – | Navigation, layout consistency, loading, empty and error states on all screens | – | ✅ No issues found |
| – | Horizontal overflow at any viewport | – | ✅ None |
| – | Buttons or links without an accessible name | – | ✅ None |
| – | Non-functional or misleading controls | – | ✅ None found; all 7 navigation items lead to working pages |

## 6. Critical bugs

| ID | Bug | Impact | Fix |
| --- | --- | --- | --- |
| C-1 | `server/package.json` started `node dist/index.js`, but TypeScript emits `dist/src/index.js` | The server cannot start in any deployment | `start` → `node dist/src/index.js`; verified |
| H-1 | No `trust proxy`. Behind an HTTPS proxy Express sees HTTP, so `express-session` silently withholds the `Secure` cookie | Login returns 200 but the user is not signed in on the next request. Reproduced against the production build | `TRUST_PROXY` setting, `COOKIE_SECURE` override for local HTTP testing, and a startup warning when misconfigured; verified with `X-Forwarded-Proto: https` |
| H-2 | No rate limiting | Password brute force, invite-code guessing, mass sign-ups, AI cost abuse | Limits on login (10 per IP + email per 15 min), registration (20 per IP per hour), join (10 per user per 15 min), assistant (10 per user per min); `Retry-After` header; tested |
| H-3 | No deployable build or migration path | No way to run migrations safely (`migrate dev` only); build didn't generate the Prisma client; the frontend only worked through the Vite dev proxy, and a cross-site split would break `SameSite=Lax` cookies | `db:deploy` (`prisma migrate deploy`), `build:deploy`, `db:seed:prod` (compiled seed, no `tsx`), and `SERVE_CLIENT` to serve the built app from the API on one origin with correct caching |

## 7. Fixes implemented

All on `release/phase-1.1-readiness`.

| ID | Change | Files |
| --- | --- | --- |
| C-1 | Correct production start path | `server/package.json` |
| H-1 | `TRUST_PROXY`, `COOKIE_SECURE`, misconfiguration warning | `server/src/config/env.ts`, `server/src/app.ts`, `server/src/routes/auth.ts` |
| H-2 | In-memory fixed-window rate limiter on login, register, join and assistant | `server/src/lib/rateLimit.ts`, `routes/auth.ts`, `routes/households.ts`, `routes/assistant.ts` |
| H-3 | `build:deploy`, `db:deploy`, `db:seed:prod`, root `start`; optional same-origin static serving with SPA fallback, immutable asset caching and `no-cache` HTML | `package.json`, `server/package.json`, `server/src/app.ts` |
| M-1 | Origin check on non-GET API requests | `server/src/app.ts` |
| M-2 | Security headers and CSP | `server/src/app.ts` |
| M-3 | `POST /households` returns 409 if the user already has a household | `server/src/routes/households.ts` |
| M-4 | 413 for oversized bodies; other client errors from body parsing return 4xx | `server/src/app.ts` |
| M-5 | `GET /api/v1/health/ready` (checks the database); JSON request logs (on by default in production); unhandled-rejection logging | `server/src/app.ts`, `server/src/index.ts` |
| M-6 | Labelled values in the mobile cooking dialog | `client/src/features/cooking/CookingDialog.tsx`, `client/src/styles.css` |
| M-8 | Environment-appropriate error messages | `client/src/lib/api.ts` |
| M-9 | Login does the same bcrypt work for unknown emails, so timing doesn't reveal accounts | `server/src/routes/auth.ts` |
| – | Production rejects the placeholder `SESSION_SECRET` | `server/src/config/env.ts` |
| L-1, L-2, L-5 | Inline icons, favicon, text contrast | `client/src/styles.css`, `client/index.html` |
| L-3 | Route-level code splitting (main chunk 794 → 599 KB) | `client/src/App.tsx` |
| L-4 | Shopping list returns `today`; the page no longer fetches the whole planner | `server/src/services/shopping.ts`, `client/src/features/shopping/ShoppingPage.tsx` |
| L-6 | Stable memo in the pantry page | `client/src/features/pantry/PantryPage.tsx` |
| Tests | 7 security regression tests; test client supports `Origin` and raw bodies | `server/src/routes/security.test.ts`, `server/src/test/helpers.ts`, `server/scripts/run-tests.ts` |
| Docs | Staging settings in `.env.example`; this report | `server/.env.example`, `RELEASE-READINESS.md` |

**Regression caught during verification:** the new Origin check (M-1) initially blocked sign-in on the dev server when the app was opened via `127.0.0.1` or a LAN IP. Vite's proxy shorthand sets `changeOrigin: true`, which rewrites `Host`. The fix sets `changeOrigin: false` in `client/vite.config.ts`. Re-verified on `localhost`, `127.0.0.1` and the LAN IP: sign-in returns 200 on all three, and foreign-origin writes return 403 on all three.

Investigated and **not** changed: notifications after stock decreases. I suspected repeated alerts, but analysis showed they fire only when an ingredient's shortage actually grows, so the original behaviour is correct.

## 8. Remaining risks

| ID | Risk | Severity | Recommendation |
| --- | --- | --- | --- |
| M-7 | `npm audit`: 3 high (deepmerge-ts stack exhaustion) in the Prisma CLI's config loader. It only runs at build or migration time with trusted config, so it is not reachable from user input. The only fix is Prisma 7 (breaking) | Medium | Upgrade Prisma in Phase 2; keep the CLI out of the runtime image if possible |
| R-1 | No password reset or email verification. Users who forget their password are locked out | Medium | Phase 2 feature; for the beta, reset passwords manually |
| R-2 | Rate limits are in memory and per instance, and reset on restart | Medium | Fine for one staging instance; use a shared store (Redis or PostgreSQL) before scaling out |
| R-3 | No error monitoring service. Logs go to stdout only | Medium | Add Sentry (or similar) and log retention on the hosting platform |
| R-4 | No database backups configured (infrastructure) | Medium | Enable daily backups / point-in-time recovery on the managed PostgreSQL |
| R-5 | The Gemini free tier allows about 5 requests per minute, and one question uses 2–3. Busy households will often see offline answers | Low | Enable billing for staging, or accept the offline fallback |
| R-6 | One household per user; no owner transfer or "leave household"; invite codes stay valid until regenerated | Low | Phase 2; tell the owner to regenerate codes after removing someone |
| R-7 | Sessions last 14 days from sign-in (not rolling); no "sign out everywhere" | Low | Acceptable for beta |
| R-8 | Past planned meals that were never cooked stay "Planned". They correctly stop reserving stock | Low | Consider a "missed" state later |
| L-3 | Main JS chunk still 599 KB (178 KB gzip), mostly React and the router | Low | Optional vendor splitting |
| L-7, L-8 | Dialog focus trap; pre-login 401 console message | Low | Polish |
| L-9 | Prisma warns that `package.json#prisma` config is deprecated | Low | Move to `prisma.config.ts` with the Prisma upgrade |
| R-9 | No automated browser end-to-end tests in CI (this audit used a one-off headless run) | Low | Add Playwright E2E in CI |

## 9. Staging deployment instructions

Do not deploy until the [checklist](#10-final-release-recommendation) is complete. This section documents the process only; nothing was deployed.

### Recommended topology

One Node service serves both the API and the built web app (`SERVE_CLIENT=true`) behind an HTTPS reverse proxy or the platform's load balancer. App and API share one origin, so no CORS or cross-site cookie configuration is needed.

```text
Browser ──HTTPS──▶ Reverse proxy / load balancer ──HTTP──▶ Node (npm start, port 4000) ──▶ PostgreSQL 15+
                   (TLS, sets X-Forwarded-Proto)            serves /api/v1/* and the SPA
```

### Database provisioning

- PostgreSQL 15 or newer (developed and tested on 18.6). A managed service is recommended, with backups enabled.
- Create a dedicated role and database:

  ```sql
  CREATE ROLE kitchensync LOGIN PASSWORD '<strong-random-password>';
  CREATE DATABASE kitchensync OWNER kitchensync;
  ```

- `CREATEDB` is **not** needed in staging or production (`migrate deploy` uses no shadow database).
- Connections per app instance: Prisma pool (default CPU count × 2 + 1) plus the session pool (10). Make sure the database's `max_connections` allows for that.

### Environment variables (staging)

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | Port the proxy forwards to, e.g. `4000` |
| `DATABASE_URL` | `postgresql://kitchensync:<password>@<host>:5432/kitchensync?schema=public` (add `&sslmode=require` for managed databases) |
| `SESSION_SECRET` | 64+ random characters (e.g. `openssl rand -base64 48`); never the example value |
| `TRUST_PROXY` | `1` (one proxy hop). **Required behind HTTPS**, or sign-in won't persist |
| `SERVE_CLIENT` | `true` |
| `CLIENT_ORIGIN` | The public URL, e.g. `https://staging.kitchensync.example` |
| `AI_API_KEY` | A **new** Gemini key (rotate the one exposed during development); optional |
| `AI_MODEL` / `AI_FALLBACK_MODEL` | Defaults: `gemini-2.5-flash` / `gemini-flash-lite-latest` |
| `LOG_REQUESTS` | Defaults to `true` in production |
| `RATE_LIMIT_*` | Optional; defaults 10 / 20 / 10 / 10 (see `server/.env.example`) |

Set these in the hosting platform's secret store. Do not upload a `.env` file.

### Build, migrate, start

```bash
npm ci                    # exact versions from package-lock.json (needs dev dependencies for the build)
npm run build:deploy      # prisma generate + compile server + build client (client/dist)
npm run db:deploy         # prisma migrate deploy: applies the 5 committed migrations, never resets data
npm run db:seed:prod      # ingredient catalog + 15 recipes (idempotent; safe on every deploy)
npm start                 # node server/dist/src/index.js
```

- **Health checks:** liveness `GET /api/v1/health`; readiness `GET /api/v1/health/ready` (503 if the database is unreachable).
- **Caching:** `/assets/*` is served as immutable for one year (hashed file names); `index.html` is served `no-cache`, so new releases take effect immediately.
- **Shutdown:** `SIGTERM` closes the HTTP server and database pools.

### HTTPS and cookies

- TLS terminates at the proxy, which must send `X-Forwarded-Proto: https` and keep the original `Host`. Most platforms do this by default.
- Example nginx location block:

  ```nginx
  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  ```

- Session cookie in production: `HttpOnly; Secure; SameSite=Lax`.
- Add HSTS at the proxy (`Strict-Transport-Security: max-age=31536000`) once HTTPS is confirmed.

### Alternative: separate frontend host (not recommended for staging)

If the SPA is served from a static host, build it with `VITE_API_URL=https://api.<same-site-domain>/api/v1` and set `CLIENT_ORIGIN` to the SPA's URL. Both hosts **must be the same site** (e.g. `app.example.com` and `api.example.com`), otherwise browsers won't send the `SameSite=Lax` session cookie.

### AI configuration

- Create a new key in Google AI Studio and store it only as `AI_API_KEY` in the platform's secret store.
- Settings → *AI assistant* shows whether it is connected. Without a key, or when Gemini is unavailable, the assistant answers in offline mode and the rest of the app is unaffected.
- Enable billing on the key for realistic beta usage (see R-5).

### Logging and monitoring

- Request logs are JSON lines on stdout, for example:

  ```json
  {"time":"…","method":"POST","path":"/api/v1/auth/login","status":200,"ms":413,"ip":"…","user":"…"}
  ```

  Server errors are written to stderr.
- Recommended: platform log retention, an uptime check on `/api/v1/health/ready`, and an error tracker (e.g. Sentry; not yet integrated, see R-3).

### Running a production build locally

To try a production build without HTTPS:

```bash
NODE_ENV=production SERVE_CLIENT=true COOKIE_SECURE=false npm start
```

Then open `http://localhost:4000`. Never set `COOKIE_SECURE=false` on a real deployment.

## 10. Final release recommendation

**GO for staging and a closed beta with real households,** subject to this pre-launch checklist:

1. ☐ Rotate the Gemini API key exposed during development, then set the new one only in the staging secret store.
2. ☐ Provision PostgreSQL with automated backups.
3. ☐ Set `NODE_ENV=production`, `TRUST_PROXY=1`, `SERVE_CLIENT=true`, a fresh `SESSION_SECRET` and `CLIENT_ORIGIN`.
4. ☐ Deploy with `build:deploy` → `db:deploy` → `db:seed:prod` → `start`, and confirm `/api/v1/health/ready` returns `ready`.
5. ☐ Smoke test on the staging URL: sign up, then check `/auth/me` still shows you as signed in (this proves cookies work behind the proxy). Then add stock, plan, cook, shop and receive.
6. ☐ Merge `release/phase-1.1-readiness` into `main` through a reviewed pull request.

**NOT YET for open public sign-up.** First address R-1 (password reset), R-2 (shared rate-limit store, if running more than one instance), R-3 (error monitoring), R-4 (backups) and M-7 (Prisma upgrade).
