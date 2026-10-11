/**
 * Database connection pool.
 * Uses the `postgres` driver (postgres.js).
 * DATABASE_URL is set in .env at server startup.
 * Never log query parameters that contain user content.
 */
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill in values.')
}

export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  // Do not log SQL queries in production (may contain user-supplied content)
  debug: false,
  transform: postgres.camel, // snake_case columns → camelCase in JS
})

/** Run the schema migration (idempotent — all statements use IF NOT EXISTS). */
export async function migrate(): Promise<void> {
  const { readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const schemaPath = join(import.meta.dir, 'schema.sql')
  const raw = await readFile(schemaPath, 'utf8')

  // Strip single-line comments (-- ...) and block comments (/* ... */)
  const stripped = raw
    .replace(/--[^\n]*/g, '')           // remove -- comments
    .replace(/\/\*[\s\S]*?\*\//g, '')   // remove /* */ block comments

  // Split on semicolons and run each non-empty statement
  const statements = stripped
    .split(';')
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 0)

  for (const stmt of statements) {
    await sql.unsafe(stmt)
  }
  console.log('[db] Migration complete')
}
