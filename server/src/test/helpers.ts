import { after, before } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp } from '../app.js'
import { prisma } from '../lib/prisma.js'

export type Res = { status: number; body: any; headers: Headers }
/** `origin` simulates a browser's Origin header; `rawBody` sends `body` as-is instead of JSON. */
export type Client = (method: string, path: string, body?: unknown, options?: { origin?: string; rawBody?: boolean }) => Promise<Res>

let base = ''

/** Boots the API on a random port for the current test file and shuts it down afterwards. */
export function useTestServer() {
  let server: Server
  let closePool: () => Promise<void>
  before(async () => {
    const { app, pgPool } = createApp()
    closePool = () => pgPool.end()
    server = app.listen(0)
    await new Promise(resolve => server.once('listening', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`
  })
  after(async () => {
    await new Promise(resolve => server.close(resolve))
    await Promise.all([prisma.$disconnect(), closePool()])
  })
}

/** A fetch wrapper that keeps its own session cookie, like one browser. */
export function client(): Client {
  let cookie = ''
  return async (method, path, body, options = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(options.origin ? { origin: options.origin } : {}) },
      body: body === undefined ? undefined : options.rawBody ? String(body) : JSON.stringify(body),
    })
    const setCookie = response.headers.getSetCookie()[0]
    if (setCookie) cookie = setCookie.split(';')[0]!
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers }
  }
}

let counter = 0
export async function signUpWithHousehold(name: string, defaultServings = 3) {
  const api = client()
  const email = `${name.toLowerCase()}-${Date.now()}-${counter++}@example.com`
  assert.equal((await api('POST', '/auth/register', { name, email, password: 'a-long-password' })).status, 201)
  const household = await api('POST', '/households', { name: `${name} kitchen`, defaultServings })
  assert.equal(household.status, 201)
  return { api, householdId: household.body.id as string }
}

export async function ingredientId(name: string) {
  return (await prisma.ingredient.findFirstOrThrow({ where: { householdId: null, nameKey: name.toLowerCase() } })).id
}
