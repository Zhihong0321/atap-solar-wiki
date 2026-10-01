/**
 * Postgres access for the wiki.
 *
 * Everything goes through a single pool addressed by DATABASE_URL. `search_path` is
 * pinned to the `wiki` schema on every connection, keeping wiki tables out of
 * `public` without every query having to spell the schema out.
 */
import fs from 'node:fs';
import pg from 'pg';
import { PG_SCHEMA, SCHEMA_SQL_PATH, databaseUrl, sslConfig } from './config.mjs';

// Postgres returns bigint and numeric as strings to avoid precision loss. The
// wiki only ever reads counts and byte sizes through these, which are far
// inside the safe-integer range, so parsing them keeps call sites simple.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
// `date` columns are calendar dates, not instants. Left to the default parser
// they become JS Dates at local midnight and shift a day when serialised as
// UTC, which would silently misstate an effective date or a review date.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

let pool;

export async function getPool() {
  if (pool) return pool;
  const connectionString = databaseUrl();
  pool = new pg.Pool({
    connectionString,
    max: Number(process.env.ATAP_WIKI_PG_POOL || 8),
    // Set during the startup handshake rather than by a query on the `connect`
    // event: issuing that query races the pool's first real query and pg warns
    // about the overlap.
    options: `-c search_path=${PG_SCHEMA},public`,
    ssl: sslConfig(),
  });
  pool.on('error', (error) => {
    console.error('[wiki-db] idle client error:', error.message);
  });
  return pool;
}

export async function query(text, params = []) {
  const p = await getPool();
  return p.query(text, params);
}

/** Runs `text` and returns the rows. */
export async function rows(text, params = []) {
  return (await query(text, params)).rows;
}

/** Runs `text` and returns the first row, or null. */
export async function one(text, params = []) {
  return (await query(text, params)).rows[0] ?? null;
}

/**
 * Runs `fn` inside a transaction, rolling back on any throw. Ingest uses this
 * so a failed run cannot leave the corpus mirror half-written.
 */
export async function transaction(fn) {
  const p = await getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = undefined;
}

/** Applies schema.sql (structure only) to the database in DATABASE_URL. */
export async function applySchema() {
  await query(fs.readFileSync(SCHEMA_SQL_PATH, 'utf8'));
}
