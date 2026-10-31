import { env } from './config/env.js'
import { createApp } from './app.js'
import { prisma } from './lib/prisma.js'

const { app, pgPool } = createApp()

const server = app.listen(env.PORT, () => console.log(`KitchenSync API listening on http://localhost:${env.PORT}`))
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EADDRINUSE') throw error
  console.error(`\nPort ${env.PORT} is already in use, most likely by another KitchenSync that is still running.\nClose the other terminal (Ctrl+C) or stop that program, then run \`npm run dev\` again.\n`)
  process.exit(1)
})
async function shutdown() {
  server.close()
  await Promise.all([prisma.$disconnect(), pgPool.end()])
}
process.on('unhandledRejection', error => console.error('Unhandled promise rejection', error))
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
