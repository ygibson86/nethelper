import { execFile } from 'node:child_process'
import { isIP } from 'node:net'
import { z } from 'zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'

const MAX_HOSTS = 64
const CACHE_TTL_MS = 5_000
const PING_TIMEOUT_MS = 2_500
const PARALLEL_LIMIT = 12

const bodySchema = z.object({ hosts: z.array(z.string().max(64)).max(MAX_HOSTS) })

export interface PingResult {
  host: string
  alive: boolean
  rtt?: number
  error?: string
}

const cache = new Map<string, { at: number; result: PingResult }>()
const inFlight = new Map<string, Promise<PingResult>>()

function remember(host: string, result: PingResult) {
  if (cache.size > 4096) cache.clear()
  cache.set(host, { at: Date.now(), result })
}

function pingOnce(host: string): Promise<PingResult> {
  const cached = cache.get(host)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return Promise.resolve(cached.result)

  const running = inFlight.get(host)
  if (running) return running

  const family = isIP(host) === 6 ? '-6' : '-4'
  const result = new Promise<PingResult>((resolve) => {
    execFile('ping', [family, '-n', '-c', '1', '-W', '2', host], { timeout: PING_TIMEOUT_MS, killSignal: 'SIGKILL' }, (error, stdout) => {
      if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        resolve({ host, alive: false, error: 'ping_unavailable' })
        return
      }
      const match = /time[=<]\s*([\d.]+)\s*ms/.exec(stdout)
      const pinged: PingResult = { host, alive: !error }
      if (pinged.alive && match) pinged.rtt = Number(match[1])
      remember(host, pinged)
      resolve(pinged)
    })
  }).finally(() => inFlight.delete(host))

  inFlight.set(host, result)
  return result
}

async function pingHosts(hosts: string[]): Promise<PingResult[]> {
  const results: PingResult[] = []
  let index = 0
  const worker = async () => {
    while (index < hosts.length) {
      const host = hosts[index]
      index += 1
      results.push(await pingOnce(host))
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL_LIMIT, hosts.length) }, worker))
  return results
}

export async function registerPing(app: FastifyInstance, requireAuth: (request: FastifyRequest) => Promise<unknown>) {
  app.post('/api/ping', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    await requireAuth(request)
    const body = bodySchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid_hosts' })
    const hosts = [...new Set(body.data.hosts.map((host) => host.trim()).filter((host) => isIP(host) !== 0))]
    return { results: await pingHosts(hosts) }
  })
}
