import argon2 from 'argon2'
import { SignJWT, jwtVerify } from 'jose'
import { config } from './config.js'

const secret = new TextEncoder().encode(config.JWT_SECRET)
const issuer = 'nethelper-api'
const audience = 'nethelper-web'

export async function validatePassword(password: string) {
  return argon2.verify(config.ADMIN_PASSWORD_HASH, password)
}

export async function createSession() {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${config.JWT_TTL_SECONDS}s`)
    .sign(secret)
}

export async function verifySession(token: string | undefined) {
  if (!token) return false
  try {
    const result = await jwtVerify(token, secret, { issuer, audience })
    return result.payload.role === 'admin'
  } catch {
    return false
  }
}
