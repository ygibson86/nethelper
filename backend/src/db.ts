import { Pool } from 'pg'
import { config } from './config.js'

export const db = new Pool({ connectionString: config.DATABASE_URL })

export async function initializeDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revision BIGINT NOT NULL DEFAULT 0
    )
  `)
  await db.query('ALTER TABLE app_data ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0')
  await db.query(`
    CREATE TABLE IF NOT EXISTS ssh_host_keys (
      device_id TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 22,
      algorithm TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (device_id, port)
    )
  `)
  await db.query("INSERT INTO app_data (singleton, data) VALUES (TRUE, '{}'::jsonb) ON CONFLICT (singleton) DO NOTHING")
}
