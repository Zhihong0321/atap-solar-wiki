/**
 * Wiki configuration.
 *
 * This site is read-only. Everything it publishes lives in Postgres, addressed
 * only through DATABASE_URL, so a local database and a managed one (Railway,
 * Neon, Supabase, ...) are interchangeable.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(here, '..');
export const SCHEMA_SQL_PATH = path.join(here, 'schema.sql');
export const SNAPSHOT_PATH = path.join(PROJECT_ROOT, 'data', 'wiki-snapshot.jsonl.gz');

/** Postgres schema holding the wiki tables, keeping them out of `public`. */
export const PG_SCHEMA = 'wiki';

export function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Point it at a Postgres database, e.g. postgres://user:pass@localhost:5432/atap_wiki');
  }
  return url;
}

/**
 * Managed providers sit behind TLS with their own certificate; a database on the
 * same machine usually has none. DATABASE_SSL=false/true overrides the guess.
 */
export function sslConfig() {
  const forced = process.env.DATABASE_SSL;
  if (forced === 'false') return false;
  if (forced === 'true') return { rejectUnauthorized: false };
  const { hostname } = new URL(databaseUrl());
  return ['localhost', '127.0.0.1', '::1', 'postgres', 'db'].includes(hostname) ? false : { rejectUnauthorized: false };
}
