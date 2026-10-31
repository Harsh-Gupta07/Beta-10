// Brings the test database up to date, then runs every *.test.ts file against it.
// Tests create uniquely named users and households, so the database never needs wiping.
import 'dotenv/config'
import { spawnSync } from 'node:child_process'

const url = process.env.TEST_DATABASE_URL
if (!url) {
  console.error('TEST_DATABASE_URL is not set. Add it to server/.env (see server/.env.example).')
  process.exit(1)
}
const dbName = new URL(url).pathname.slice(1)
if (!dbName.includes('test') || url === process.env.DATABASE_URL) {
  console.error(`Refusing to run tests against "${dbName}": tests write to that database, so its name must contain "test".`)
  process.exit(1)
}

// AI_API_KEY is blanked so tests exercise the offline fallback and never spend real API quota.
// Every test registers fresh users from 127.0.0.1, so the per-IP registration limit is lifted here.
const env = { ...process.env, DATABASE_URL: url, NODE_ENV: 'test', AI_API_KEY: '', RATE_LIMIT_REGISTER: '100000' }
function run(command: string) {
  const result = spawnSync(command, { shell: true, stdio: 'inherit', env })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('npx prisma migrate deploy')
// A client generated before the latest schema change makes the seed and tests fail with "Unknown field".
// On Windows this fails while a dev server holds the engine file; the existing client is then used as is.
if (spawnSync('npx prisma generate', { shell: true, stdio: 'inherit', env }).status !== 0) {
  console.warn('Prisma client could not be regenerated (is `npm run dev` running?). Testing with the existing client.')
}
run('npx tsx prisma/seed.ts')
run('npx tsx --test --test-concurrency=1 "src/**/*.test.ts"')
