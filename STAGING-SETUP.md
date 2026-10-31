# KitchenSync staging and closed-beta setup

## Purpose and branch strategy

`main` is the verified release branch. It is the source of future production releases and is changed only through reviewed pull requests.

`staging` starts at the verified `main` commit and is the branch for a separate, closed-beta staging deployment. It must use its own database, credentials, API hostname and Vercel project or environment. Feature work starts from a short-lived `feature/<name>` branch, is validated on `staging`, then reaches `main` through a pull request.

```text
feature/<name> → staging → closed beta → approved pull request → main
```

The staging branch was created from `origin/main` at `2951c8a` (`fix(client): keep original Host through the Vite dev proxy`). Phase 1.1 release-readiness commits `0970b8b`, `567afc8`, and `2951c8a` are included.

## Commands used to create and verify staging

```powershell
git fetch origin --prune
git switch -c staging --track origin/main
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run build:deploy
```

For PowerShell on this machine, use `npm.cmd` because the PowerShell `npm.ps1` script is disabled. On a normal CI or Linux host, use `npm`.

The local test command uses the separate `kitchensync_test` database, applies the five Prisma migrations, and seeds 48 canonical ingredients and 15 shared recipes. It passed during staging preparation. The standard build and deployment build both passed. `build:deploy` required stopping duplicate local API watcher processes first because they held Prisma's Windows engine file open; this does not affect a clean deployment environment.

## Vercel frontend project

Deploy the React/Vite frontend as a **separate Vercel project**. Do not connect the Express backend to this Vercel project.

| Vercel setting | Value |
| --- | --- |
| Git repository | `Harsh-Gupta07/Beta-10` |
| Branch for this staging project | `staging` |
| Project root directory | Repository root (`.` / leave Root Directory unset) |
| Framework preset | Vite |
| Install command | `npm ci` |
| Build command | `npm run --workspace client build` |
| Output directory | `client/dist` |
| Node.js | 20 or newer |

The root [vercel.json](vercel.json) records the workspace-aware build command and outputs `client/dist`. It also rewrites all requests to `index.html`, which is required for direct BrowserRouter URLs such as `/pantry`, `/planner`, and `/recipes/<id>`.

For a dedicated staging Vercel project, set its **Production Branch** to `staging`. This allows the staging project to have a stable closed-beta URL without making the repository's `main` branch the deployment source. Do not create or deploy the project automatically from this repository setup; configure it in the Vercel dashboard when the staging domain and API host are ready.

## Frontend environment variable

Set this variable in the Vercel project's environment for the `staging` deployment:

| Variable | Required value |
| --- | --- |
| `VITE_API_URL` | `https://api.staging.<your-domain>/api/v1` |

`VITE_API_URL` is intentionally public because Vite embeds it into browser code. Do **not** add database URLs, session secrets, Gemini keys, or any server credential to Vercel's frontend project.

The variable must be present before a new deployment, since Vite reads it at build time. Redeploy after changing it.

## Backend deployment requirements

Deploy `server/` as a persistent Node.js service on a backend host that supports Express and PostgreSQL connectivity. It needs a separate staging database. Configure the following values in that host's secret manager:

| Variable | Staging requirement |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | Provided by the host, if required |
| `DATABASE_URL` | A new staging PostgreSQL database URL; use TLS such as `?sslmode=require` for managed PostgreSQL |
| `SESSION_SECRET` | A new random secret of at least 64 characters; never reuse development or production values |
| `CLIENT_ORIGIN` | Exact frontend staging origin, for example `https://app.staging.<your-domain>` |
| `TRUST_PROXY` | `1` when the host is behind one HTTPS proxy/load balancer hop |
| `COOKIE_SECURE` | Leave unset in production; secure cookies are the default |
| `AI_API_KEY` | Optional new Gemini key stored only in the backend secret manager |
| `AI_MODEL` | Optional; defaults to `gemini-2.5-flash` |
| `AI_FALLBACK_MODEL` | Optional; defaults to `gemini-flash-lite-latest` |

Set `SERVE_CLIENT=false` (or leave it unset) for this separate-frontend deployment. `SERVE_CLIENT=true` is only for the alternative single-origin deployment where Express serves `client/dist` itself.

Backend deployment order:

```bash
npm ci
npm run build:deploy
npm run db:deploy
npm run db:seed:prod
npm run start
```

Run `db:seed:prod` when creating the new staging database. The seed is idempotent, so it is safe to run again if the initial setup is interrupted.

## Cookie and domain requirement

KitchenSync uses HTTP-only `SameSite=Lax` session cookies. For browser authentication to work with a separately hosted frontend and API, both hosts must be the same site, for example:

```text
https://app.staging.example.com
https://api.staging.example.com
```

A default `*.vercel.app` frontend plus an unrelated backend hostname is cross-site. In that configuration, browsers will not send the session cookie consistently, and login will fail. Set up a shared custom parent domain before closed-beta access.

## Database setup

Create a dedicated PostgreSQL database and database user for staging. Do not point staging at the development, test, or production database.

- Apply committed migrations only with `npm run db:deploy`; never run `prisma migrate dev` in staging.
- Back up the staging database before schema changes that cannot be safely rolled back.
- Keep staging `DATABASE_URL`, `SESSION_SECRET`, and `AI_API_KEY` distinct from production.
- Keep `TEST_DATABASE_URL` out of the staging runtime. It is only required for local/CI test runs.

## Deployment verification checklist

- [ ] Vercel staging project uses `staging`, the repository root, `npm ci`, and `client/dist`.
- [ ] `VITE_API_URL` points to the HTTPS staging API URL ending in `/api/v1`.
- [ ] Frontend and API use same-site staging subdomains.
- [ ] Backend secrets are configured only in the backend host.
- [ ] Backend release ran `build:deploy`, `db:deploy`, then `db:seed:prod` successfully.
- [ ] `GET /api/v1/health/ready` returns `{ "status": "ready", "database": "ok" }`.
- [ ] A closed-beta user can register, create a household, sign out, and sign back in.
- [ ] Deep links to `/pantry`, `/planner`, and `/recipes/<id>` render after a full browser refresh.
- [ ] Planning, stock correction, shopping receipt, and cooking completion operate against staging data only.
- [ ] Browser developer tools show no secrets and no mixed-content or CORS errors.

## Known limitations and follow-up work

- No backend host, staging domain, Vercel project, or managed PostgreSQL instance is created by this repository setup. Those remain manual infrastructure decisions.
- In-memory rate limits apply per backend instance. Use a shared rate-limit store before horizontally scaling the backend.
- The frontend build completes successfully but reports a 598 KB initial JavaScript chunk warning. The main feature pages are already lazy-loaded; further bundle analysis can be scheduled after closed-beta feedback.
- `npm audit --omit=dev` reports three high-severity findings in Prisma's `deepmerge-ts` dependency. The available automated fix upgrades Prisma to the major 7.x line. Do not run that major upgrade as part of staging setup; plan, test, and review it separately.
- Prisma reports that `package.json#prisma` configuration is deprecated for Prisma 7. This is non-blocking on Prisma 6.19.3 and should be migrated during the planned Prisma upgrade.

## Rollback procedure

1. In the Vercel staging project, redeploy the previous known-good `staging` deployment or revert the offending commit through a new pull request.
2. In the backend host, redeploy the matching prior server artifact.
3. If a database migration caused the issue, do not delete data or run an ad-hoc down migration. Restore the pre-release staging backup or apply a reviewed forward repair migration.
4. Verify `/api/v1/health/ready`, login, and a complete pantry-to-cooking flow before reopening closed-beta access.

## Security confirmation

`.env`, `server/.env`, and `client/.env` are ignored by Git. Only `server/.env.example` is tracked, and it contains variable names and placeholder values. No database password, session secret, or Gemini API key is included in this branch.
