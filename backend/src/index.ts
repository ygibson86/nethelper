import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { z } from 'zod'
import { config, secureCookies } from './config.js'
import { createSession, validatePassword, verifySession } from './auth.js'
import { db, initializeDatabase } from './db.js'

const cookieName = 'nethelper_session'
const dataSchema = z.record(z.string(), z.unknown()).refine((value) => !['__proto__', 'constructor', 'prototype'].some((key) => Object.prototype.hasOwnProperty.call(value, key)), 'Unsafe data object')
const loginSchema = z.object({ password: z.string().min(1).max(1024) })

const app = Fastify({ logger: true, trustProxy: true, bodyLimit: 2 * 1024 * 1024 })

await app.register(cookie)
await app.register(helmet, { contentSecurityPolicy: false })
await app.register(rateLimit, { global: false })

async function requireAuth(request: FastifyRequest) {
  if (await verifySession(request.cookies[cookieName])) return
  const error = new Error('Unauthorized') as Error & { statusCode: number }
  error.statusCode = 401
  throw error
}

function setSessionCookie(reply: FastifyReply) {
  reply.setCookie(cookieName, '', { path: '/api', httpOnly: true, sameSite: 'strict', secure: secureCookies, maxAge: 0 })
}

app.get('/health', async () => ({ status: 'ok' }))

app.post('/api/login', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request, reply) => {
  const body = loginSchema.safeParse(request.body)
  if (!body.success || !(await validatePassword(body.data.password))) return reply.code(401).send({ error: 'invalid_credentials' })
  const token = await createSession()
  reply.setCookie(cookieName, token, { path: '/api', httpOnly: true, sameSite: 'strict', secure: secureCookies, maxAge: config.JWT_TTL_SECONDS })
  return { authenticated: true }
})

app.post('/api/logout', async (_request, reply) => {
  setSessionCookie(reply)
  return { authenticated: false }
})

app.get('/api/session', async (request, reply) => {
  if (!(await verifySession(request.cookies[cookieName]))) return reply.code(401).send({ authenticated: false })
  return { authenticated: true }
})

app.get('/api/data', async (request) => {
  await requireAuth(request)
  const result = await db.query<{ data: Record<string, unknown>; updated_at: Date }>('SELECT data, updated_at FROM app_data WHERE singleton = TRUE')
  return { data: result.rows[0].data, updatedAt: result.rows[0].updated_at.toISOString() }
})

app.put('/api/data', async (request, reply) => {
  await requireAuth(request)
  const origin = request.headers.origin
  if (origin && origin !== config.PUBLIC_ORIGIN) return reply.code(403).send({ error: 'forbidden_origin' })
  const body = dataSchema.safeParse(request.body)
  if (!body.success) return reply.code(400).send({ error: 'invalid_data' })
  const result = await db.query<{ data: Record<string, unknown>; updated_at: Date }>('UPDATE app_data SET data = $1::jsonb, updated_at = NOW() WHERE singleton = TRUE RETURNING data, updated_at', [JSON.stringify(body.data)])
  return { data: result.rows[0].data, updatedAt: result.rows[0].updated_at.toISOString() }
})

await initializeDatabase()
await app.listen({ host: '0.0.0.0', port: 3000 })

const shutdown = async () => {
  await app.close()
  await db.end()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
