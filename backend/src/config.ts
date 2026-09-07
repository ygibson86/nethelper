import { z } from 'zod'

const environment = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('production'),
  DATABASE_URL: z.string().url(),
  ADMIN_PASSWORD_HASH: z.string().min(20),
  JWT_SECRET: z.string().min(32),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(28800),
  PUBLIC_ORIGIN: z.string().url(),
  SSH_ALLOWED_CIDRS: z.string().optional(),
  SSH_ALLOWED_CIDR: z.string().default('10.109.33.0/24'),
  SSH_PORT: z.coerce.number().int().min(1).max(65535).default(22),
  SSH_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(12000),
  SSH_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(28800).default(1800),
  SSH_MAX_SESSIONS: z.coerce.number().int().min(1).max(100).default(20),
  SSH_MAX_LIFETIME_SECONDS: z.coerce.number().int().min(60).max(28800).default(28800),
  SSH_LEGACY_ELTEX: z.string().default('true').transform((value) => value === 'true'),
})

export const config = environment.parse(process.env)
export const secureCookies = new URL(config.PUBLIC_ORIGIN).protocol === 'https:'
