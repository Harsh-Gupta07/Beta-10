import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import { env } from '../config/env.js'
import { prisma } from '../lib/prisma.js'
import { AppError } from '../lib/errors.js'

// "Continue with Google": the browser gets a signed ID token from Google; we check it here and never see a Google password.

export type GoogleProfile = { sub: string; email: string; emailVerified: boolean; name: string }

const verifier = new OAuth2Client()

/** Checks Google's signature, expiry, issuer and that the token was issued for our client ID. */
export async function verifyGoogleCredential(credential: string): Promise<GoogleProfile> {
  if (!env.GOOGLE_CLIENT_ID) throw new AppError(404, 'Google sign-in isn’t set up on this server.')
  let payload
  try { payload = (await verifier.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID })).getPayload() }
  catch { throw new AppError(401, 'Google sign-in couldn’t be verified. Please try again.') }
  if (!payload?.sub || !payload.email) throw new AppError(401, 'Google didn’t share an email address for this account.')
  return { sub: payload.sub, email: payload.email.toLowerCase(), emailVerified: payload.email_verified === true, name: payload.name?.trim() || payload.email.split('@')[0]! }
}

/**
 * The KitchenSync account for a Google profile: the one already linked to it, else the account with the same
 * verified email (which gets linked), else a new account without a password.
 */
export async function accountForGoogle(profile: GoogleProfile) {
  const linked = await prisma.user.findUnique({ where: { googleSub: profile.sub }, select: { id: true } })
  if (linked) return { userId: linked.id, isNew: false }
  // Linking by email is only safe when Google has verified the address belongs to this person.
  if (!profile.emailVerified) throw new AppError(401, 'Please verify your email address with Google first, then try again.')
  const byEmail = await prisma.user.findUnique({ where: { email: profile.email }, select: { id: true, googleSub: true } })
  if (byEmail) {
    if (byEmail.googleSub) throw new AppError(409, 'This email is already linked to a different Google account.')
    await prisma.user.update({ where: { id: byEmail.id }, data: { googleSub: profile.sub } })
    return { userId: byEmail.id, isNew: false }
  }
  const user = await prisma.user.create({
    data: { name: profile.name.slice(0, 80), email: profile.email, googleSub: profile.sub, hasPassword: false, passwordHash: await bcrypt.hash(randomUUID(), 10) },
    select: { id: true },
  })
  return { userId: user.id, isNew: true }
}
