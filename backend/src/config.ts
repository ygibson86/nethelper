import { z } from 'zod'

const environment = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('production'),
  DATABASE_URL: z.string().url(),
  ADMIN_PASSWORD_HASH: z.string().min(20),
  JWT_SECRET: z.string().min(32),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(28800),
  PUBLIC_ORIGIN: z.string().url(),
})

export const config = environment.parse(process.env)
export const secureCookies = new URL(config.PUBLIC_ORIGIN).protocol === 'https:'
