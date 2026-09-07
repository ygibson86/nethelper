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

const cookieName = 'nethelper_session'
const id = z.string().min(1).max(256)
const text = z.string().max(100_000)
const deviceType = z.enum(['switch', 'router', 'pc', 'server', 'firewall', 'access-point', 'printer', 'phone', 'camera', 'cloud', 'ups', 'nas', 'patch-panel', 'text', 'group'])
const handleLayout = z.object({ top: z.number().int().min(0).max(16), bottom: z.number().int().min(0).max(16), left: z.number().int().min(0).max(16), right: z.number().int().min(0).max(16) })
const dataSchema = z.object({
  version: z.number().int().positive(),
  manufacturers: z.array(z.object({ id, name: text, abbreviation: z.string().max(16), color: z.string().max(64), deviceTypes: z.array(deviceType) })),
  switches: z.array(z.object({ id, hostname: text, ip: z.string().max(256), manufacturerId: z.string().max(256), deviceType, model: text, accessMethods: z.array(z.enum(['ssh', 'rdp'])), description: text, rackId: id, topologyId: id.optional(), isCore: z.boolean().optional() })),
  racks: z.array(z.object({ id, name: text, location: text, group: text, switchIds: z.array(id) })),
  groups: z.array(text).optional(),
  topologies: z.array(z.object({ id, name: text, description: text, nodes: z.array(z.object({ id, x: z.number().finite(), y: z.number().finite(), label: text, text: text.optional(), name: text.optional(), type: deviceType, color: z.string().max(64), manufacturerId: id.optional(), handles: handleLayout.optional(), width: z.number().positive().max(5000).optional(), height: z.number().positive().max(5000).optional(), groupLabelPosition: z.enum(['top', 'center']).optional(), switchId: id.optional(), ip: z.string().max(256).optional(), fontSize: z.number().min(8).max(200).optional() })), links: z.array(z.object({ id, source: id, target: id, sourceHandle: id.optional(), targetHandle: id.optional(), sourcePort: text, targetPort: text, cableType: z.enum(['copper', 'fiber', 'dac', 'wireless']), label: text.optional(), showLabel: z.boolean().optional() })) })),
  corePanels: z.array(z.object({ id, switchId: id, model: text, ports: z.array(z.object({ id, identifier: text, status: z.enum(['active', 'inactive', 'disabled']), ip: z.string().max(256), label: text })), rows: z.array(z.object({ id, label: text, portIds: z.array(id) })), layoutTemplate: z.enum(['single-28', 'stacked-56', 'custom']) })),
  settings: z.object({ theme: z.enum(['dark', 'light']), fontSize: z.number().min(12).max(24), portsPerRow: z.number().int().min(1).max(128) }),
  configTemplates: z.array(z.object({ id, vendor: z.enum(['eltex', 'cisco']), title: text, description: text, body: text, updatedAt: z.string().max(128) })),
}).strict()
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
await app.listen({ host: '0.0.0.0', port: 3000 })

const shutdown = async () => {
  closeSshSessions()
  await app.close()
  await db.end()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
