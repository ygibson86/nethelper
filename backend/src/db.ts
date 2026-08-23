import { Pool } from 'pg'
import { config } from './config.js'

export const db = new Pool({ connectionString: config.DATABASE_URL })

export async function initializeDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await db.query("INSERT INTO app_data (singleton, data) VALUES (TRUE, '{}'::jsonb) ON CONFLICT (singleton) DO NOTHING")
}
