import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { WebSocket } from 'ws'
import { Client, type ConnectConfig, type ClientChannel } from 'ssh2'
import net from 'node:net'
import crypto from 'node:crypto'
import { db } from './db.js'
import { config } from './config.js'

interface SessionRequest extends FastifyRequest { sshExpiresAt?: number }
type State = 'new' | 'connecting' | 'connected' | 'closed'
type ClientMessage = { type: string; host?: string; username?: string; password?: string; fingerprint?: string; cols?: number; rows?: number; data?: string }
type SshTarget = { key: string; hostname: string; ip: string; manufacturerId: string }

const sessions = new Set<WebSocket>()
const pendingSessions = new Set<WebSocket>()
const allowedCidrs = (config.SSH_ALLOWED_CIDRS ?? config.SSH_ALLOWED_CIDR).split(',').map((value) => value.trim()).filter(Boolean)

function parseIpv4(value: string) {
  if (net.isIP(value) !== 4) return null
  return value.split('.').reduce((result, part) => (result << 8) + Number(part), 0) >>> 0
}

function cidrContains(cidr: string, ip: string) {
  const [networkValue, prefixValue] = cidr.split('/')
  const address = parseIpv4(ip)
  const network = parseIpv4(networkValue)
  const prefix = Number(prefixValue)
  if (address === null || network === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (address & mask) === (network & mask)
}

function ipAllowed(ip: string) {
  return allowedCidrs.some((cidr) => cidrContains(cidr, ip))
}

function parseMessage(raw: Buffer): ClientMessage | null {
  if (raw.length > 32 * 1024) return null
  try {
    const value = JSON.parse(raw.toString()) as unknown
    if (!value || typeof value !== 'object' || typeof (value as Record<string, unknown>).type !== 'string') return null
    return value as ClientMessage
  } catch { return null }
}

function fingerprint(key: Buffer) {
  return `SHA256:${crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`
}

function keyAlgorithm(key: Buffer) {
  if (key.length < 4) return 'unknown'
  const length = key.readUInt32BE(0)
  return length > 0 && length <= key.length - 4 ? key.subarray(4, 4 + length).toString('ascii').slice(0, 64) : 'unknown'
}

async function findDevice(deviceId: string) {
  const result = await db.query<{ hostname: string; ip: string; manufacturer_id: string; access_methods: unknown }>(`SELECT device->>'hostname' hostname, device->>'ip' ip, device->>'manufacturerId' manufacturer_id, device->'accessMethods' access_methods FROM app_data, jsonb_array_elements(data->'switches') device WHERE singleton = TRUE AND device->>'id' = $1 LIMIT 1`, [deviceId])
  const device = result.rows[0]
  if (!device || !ipAllowed(device.ip) || !Array.isArray(device.access_methods) || !device.access_methods.includes('ssh')) return null
  return { key: deviceId, hostname: device.hostname, ip: device.ip, manufacturerId: device.manufacturer_id }
}

function manualTarget(host: string | undefined): SshTarget | null {
  const ip = host?.trim() ?? ''
  if (!ipAllowed(ip)) return null
  return { key: `address:${ip}`, hostname: ip, ip, manufacturerId: '' }
}

async function verifyAndPinHostKey(deviceId: string, key: Buffer, accepted: string | undefined, socket: WebSocket) {
  const actual = fingerprint(key)
  const existing = await db.query<{ fingerprint: string }>('SELECT fingerprint FROM ssh_host_keys WHERE device_id = $1 AND port = $2', [deviceId, config.SSH_PORT])
  const saved = existing.rows[0]?.fingerprint
  if (saved) {
    if (saved !== actual) { send(socket, { type: 'host-key-changed', expected: saved, fingerprint: actual }); return false }
    await db.query('UPDATE ssh_host_keys SET last_seen_at = NOW() WHERE device_id = $1 AND port = $2', [deviceId, config.SSH_PORT])
    return true
  }
  if (accepted !== actual) { send(socket, { type: 'host-key-unknown', fingerprint: actual }); return false }
  const inserted = await db.query<{ fingerprint: string }>('INSERT INTO ssh_host_keys (device_id, port, algorithm, fingerprint) VALUES ($1, $2, $3, $4) ON CONFLICT (device_id, port) DO NOTHING RETURNING fingerprint', [deviceId, config.SSH_PORT, keyAlgorithm(key), actual])
  if (inserted.rowCount) return true
  const concurrent = await db.query<{ fingerprint: string }>('SELECT fingerprint FROM ssh_host_keys WHERE device_id = $1 AND port = $2', [deviceId, config.SSH_PORT])
  return concurrent.rows[0]?.fingerprint === actual
}

function send(socket: WebSocket, message: Record<string, unknown>) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
}

export async function registerSsh(app: FastifyInstance, requireAuth: (request: FastifyRequest) => Promise<{ exp?: number }>) {
  app.delete('/api/ssh/host-keys/:deviceId', async (request, reply) => {
    await requireAuth(request)
    if (request.headers.origin !== config.PUBLIC_ORIGIN) return reply.code(403).send({ error: 'forbidden_origin' })
    const deviceId = String((request.params as { deviceId: string }).deviceId)
    if (!(await findDevice(deviceId))) return reply.code(404).send({ error: 'device_not_found' })
    await db.query('DELETE FROM ssh_host_keys WHERE device_id = $1 AND port = $2', [deviceId, config.SSH_PORT])
    return { removed: true }
  })

  app.delete('/api/ssh/host-keys/by-address/:host', async (request, reply) => {
    await requireAuth(request)
    if (request.headers.origin !== config.PUBLIC_ORIGIN) return reply.code(403).send({ error: 'forbidden_origin' })
    const target = manualTarget(String((request.params as { host: string }).host))
    if (!target) return reply.code(400).send({ error: 'address_not_allowed' })
    await db.query('DELETE FROM ssh_host_keys WHERE device_id = $1 AND port = $2', [target.key, config.SSH_PORT])
    return { removed: true }
  })

  const preValidation = async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = await requireAuth(request)
    if (request.headers.origin !== config.PUBLIC_ORIGIN) return reply.code(403).send({ error: 'forbidden_origin' })
    if (sessions.size + pendingSessions.size >= config.SSH_MAX_SESSIONS) return reply.code(429).send({ error: 'too_many_ssh_sessions' })
    ;(request as SessionRequest).sshExpiresAt = payload.exp ? payload.exp * 1000 : Date.now() + config.SSH_MAX_LIFETIME_SECONDS * 1000
  }

  const handleConnection = (socket: WebSocket, request: FastifyRequest, manual: boolean) => {
    pendingSessions.add(socket)
    let state: State = 'new'
    let client: Client | null = null
    let shell: ClientChannel | null = null
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    const deviceId = manual ? '' : String((request.params as { deviceId?: string }).deviceId ?? '')
    const expiresAt = Math.min((request as SessionRequest).sshExpiresAt ?? Date.now(), Date.now() + config.SSH_MAX_LIFETIME_SECONDS * 1000)
    const lifetimeTimer = setTimeout(() => fail('session_expired', 'Срок SSH-сессии истёк.'), Math.max(1, expiresAt - Date.now()))
    const connectTimer = setTimeout(() => { if (state === 'new') fail('connect_timeout', 'Данные подключения не получены.') }, 15000)

    const cleanup = () => {
      if (state === 'closed') return
      state = 'closed'
      clearTimeout(connectTimer)
      clearTimeout(lifetimeTimer)
      if (idleTimer) clearTimeout(idleTimer)
      sessions.delete(socket)
      pendingSessions.delete(socket)
      try { shell?.close() } catch { /* closed */ }
      try { client?.end() } catch { /* closed */ }
      try { client?.destroy() } catch { /* closed */ }
      if (socket.readyState === socket.OPEN) socket.close()
    }
    function fail(code: string, message: string) { send(socket, { type: 'error', code, message }); cleanup() }
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => fail('idle_timeout', 'Сессия завершена по тайм-ауту бездействия.'), config.SSH_IDLE_TIMEOUT_SECONDS * 1000)
    }

    const handleMessage = async (raw: Buffer) => {
      const message = parseMessage(raw)
      if (!message) return fail('invalid_message', 'Некорректное или слишком большое сообщение.')
      if (message.type === 'close') return cleanup()
      if (message.type === 'connect') {
        if (state !== 'new') return fail('duplicate_connect', 'Подключение уже выполняется.')
        state = 'connecting'
        clearTimeout(connectTimer)
        const username = message.username?.trim() ?? ''
        let password = message.password ?? ''
        const acceptedFingerprint = message.fingerprint
        const cols = Math.min(Math.max(Number(message.cols) || 120, 20), 240)
        const rows = Math.min(Math.max(Number(message.rows) || 32, 5), 100)
        if (!username || !password || username.length > 128 || password.length > 1024) return fail('invalid_credentials', 'Укажите имя пользователя и пароль.')
        const target = manual ? manualTarget(message.host) : await findDevice(deviceId)
        if (state !== 'connecting') return
        if (!target) return fail('device_not_allowed', manual ? `Разрешены только IPv4-адреса из разрешённых подсетей: ${allowedCidrs.join(', ')}.` : 'Устройство не найдено или SSH для него запрещён.')
        const currentClient = new Client()
        pendingSessions.delete(socket)
        sessions.add(socket)
        client = currentClient
        let hostKeyRejected = false
        const algorithms: ConnectConfig['algorithms'] = config.SSH_LEGACY_ELTEX && target.manufacturerId.toLowerCase() === 'eltex' ? {
          kex: { append: ['diffie-hellman-group14-sha1'], prepend: [], remove: [] },
          serverHostKey: { append: ['ssh-rsa'], prepend: [], remove: [] },
          cipher: { append: ['aes128-cbc'], prepend: [], remove: [] },
        } : undefined
        currentClient.once('ready', () => {
          if (state !== 'connecting') return currentClient.end()
          state = 'connected'
          password = ''
          const internal = currentClient as unknown as { config?: { password?: string } }
          if (internal.config) internal.config.password = ''
          currentClient.shell({ term: 'xterm-256color', cols, rows }, (error, stream) => {
            if (error || !stream) return fail('shell_failed', 'Не удалось открыть терминал.')
            shell = stream
            stream.on('data', (data: Buffer) => {
              resetIdle()
              if (socket.bufferedAmount > 1024 * 1024) { stream.pause(); setTimeout(() => stream.resume(), 100) }
              send(socket, { type: 'output', data: data.toString('base64'), encoding: 'base64' })
            })
            stream.on('error', () => fail('shell_error', 'Ошибка терминального канала.'))
            stream.on('close', cleanup)
            resetIdle()
            send(socket, { type: 'ready', hostname: target.hostname, ip: target.ip, legacyCompatibility: Boolean(algorithms) })
          })
        })
        currentClient.on('error', (error) => {
          if (state === 'closed') return
          if (hostKeyRejected) return cleanup()
          fail(error.message.includes('All configured authentication methods failed') ? 'auth_failed' : 'connect_failed', error.message.includes('All configured authentication methods failed') ? 'Неверное имя пользователя или пароль.' : 'SSH-подключение не установлено.')
        })
        currentClient.on('close', cleanup)
        currentClient.connect({ host: target.ip, port: config.SSH_PORT, username, password, readyTimeout: config.SSH_CONNECT_TIMEOUT_MS, tryKeyboard: false, algorithms, hostVerifier: (key: Buffer, verify: (valid: boolean) => void) => {
          void verifyAndPinHostKey(target.key, key, acceptedFingerprint, socket).then((allowed) => { hostKeyRejected = !allowed; verify(allowed) }).catch(() => { hostKeyRejected = true; verify(false); fail('host_key_store_failed', 'Не удалось проверить SSH-ключ устройства.') })
        } })
        return
      }
      if (state !== 'connected' || !shell) return
      if (message.type === 'input' && typeof message.data === 'string' && message.data.length <= 16384) { shell.write(message.data); resetIdle() }
      if (message.type === 'resize' && Number.isInteger(message.cols) && Number.isInteger(message.rows) && message.cols! >= 20 && message.cols! <= 240 && message.rows! >= 5 && message.rows! <= 100) shell.setWindow(message.rows!, message.cols!, 0, 0)
    }

    socket.on('message', (raw: Buffer) => { void handleMessage(raw).catch(() => fail('internal_error', 'Внутренняя ошибка SSH-сессии.')) })
    socket.on('close', cleanup)
    socket.on('error', cleanup)
  }

  app.get('/api/ssh/devices/:deviceId', { websocket: true, preValidation }, (socket, request) => handleConnection(socket, request, false))
  app.get('/api/ssh/connect', { websocket: true, preValidation }, (socket, request) => handleConnection(socket, request, true))
}

export function closeSshSessions() { sessions.forEach((socket) => socket.close()); sessions.clear() }
