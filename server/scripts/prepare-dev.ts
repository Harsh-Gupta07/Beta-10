// Runs before `npm run dev` so a freshly cloned or pulled copy just works:
// apply any new database migrations, regenerate the Prisma client, and refresh the sample catalog.
import 'dotenv/config'
import { spawnSync } from 'node:child_process'

const step = (label: string, command: string) => {
  console.log(`[setup] ${label}…`)
  return spawnSync(command, { shell: true, stdio: 'inherit' }).status === 0
}

if (!process.env.DATABASE_URL) {
  console.error('[setup] DATABASE_URL is missing. Copy server/.env.example to server/.env and set your PostgreSQL connection (see README → Quick start).')
  process.exit(1)
}

if (!step('Applying database migrations', 'npx prisma migrate deploy')) {
  console.error('[setup] Could not update the database. Check that PostgreSQL is running and DATABASE_URL in server/.env is correct.')
  process.exit(1)
}

// On Windows this fails if another KitchenSync server is still running and holding the Prisma engine.
if (!step('Generating the Prisma client', 'npx prisma generate')) {
  console.warn('[setup] Prisma client could not be regenerated (another server may still be running). If the API reports database errors, stop every running `npm run dev` and start again.')
}

// The seed is idempotent: it refreshes ingredients, allergen tags and shared recipes without touching household data.
if (!step('Refreshing the ingredient catalog and recipes', 'npx tsx prisma/seed.ts')) {
  console.warn('[setup] Seeding failed; recipes or staples may be missing. Run `npm run db:seed` to see why.')
}
