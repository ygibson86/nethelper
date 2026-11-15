import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import { z } from 'zod'
import { config, secureCookies } from './config.js'
import { createSession, getSessionPayload, validatePassword, verifySession } from './auth.js'
import { db, initializeDatabase } from './db.js'
import { closeSshSessions, registerSsh } from './ssh.js'
import { registerPing } from './ping.js'
import { dataSchema } from './dataSchema.js'

const cookieName = 'nethelper_session'
const loginSchema = z.object({ password: z.string().min(1).max(1024) })

const app = Fastify({ logger: true, trustProxy: true, bodyLimit: 2 * 1024 * 1024 })

await app.register(cookie)
await app.register(helmet, { contentSecurityPolicy: false })
await app.register(rateLimit, { global: false })
await app.register(websocket)

async function requireAuth(request: FastifyRequest) {
  try {
    return await getSessionPayload(request.cookies[cookieName])
  } catch {
    const error = new Error('Unauthorized') as Error & { statusCode: number }
    error.statusCode = 401
    throw error
  }
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
  const result = await db.query<{ data: Record<string, unknown>; updated_at: Date; revision: string }>('SELECT data, updated_at, revision FROM app_data WHERE singleton = TRUE')
  return { data: result.rows[0].data, updatedAt: result.rows[0].updated_at.toISOString(), revision: Number(result.rows[0].revision) }
})

app.put('/api/data', async (request, reply) => {
  await requireAuth(request)
  const origin = request.headers.origin
  if (origin && origin !== config.PUBLIC_ORIGIN) return reply.code(403).send({ error: 'forbidden_origin' })
  const body = dataSchema.safeParse(request.body)
  if (!body.success) {
    request.log.warn({ issues: body.error.issues }, 'Rejected invalid app data')
    return reply.code(400).send({ error: 'invalid_data', issues: body.error.issues })
  }
  const versionHeader = request.headers['if-match']
  const expectedRevision = typeof versionHeader === 'string' ? Number(versionHeader.replace(/^"|"$/g, '')) : Number.NaN
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return reply.code(428).send({ error: 'version_required' })
  const result = await db.query<{ data: Record<string, unknown>; updated_at: Date; revision: string }>('UPDATE app_data SET data = $1::jsonb, updated_at = NOW(), revision = revision + 1 WHERE singleton = TRUE AND revision = $2 RETURNING data, updated_at, revision', [JSON.stringify(body.data), expectedRevision])
  if (!result.rowCount) return reply.code(409).send({ error: 'data_conflict' })
  return { data: result.rows[0].data, updatedAt: result.rows[0].updated_at.toISOString(), revision: Number(result.rows[0].revision) }
})

await initializeDatabase()
await registerSsh(app, requireAuth)
await registerPing(app, requireAuth)
await app.listen({ host: '0.0.0.0', port: 3000 })

const shutdown = async () => {
  closeSshSessions()
  await app.close()
  await db.end()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
