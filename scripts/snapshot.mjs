/**
 * Exports every wiki table (except schema_migrations) from the database in
 * DATABASE_URL to data/wiki-snapshot.jsonl.gz. Each line is
 * {"table": "...", "rows": [ ... ]}, rows being to_jsonb() of the table row, so
 * restore.mjs can rebuild exact column types with jsonb_populate_recordset.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { rows, closePool } from '../wiki-server/db.mjs';
import { PG_SCHEMA, SNAPSHOT_PATH } from '../wiki-server/config.mjs';

const BATCH = 500;
const ident = (name) => `"${name.replace(/"/g, '""')}"`;

const tables = (await rows(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations'
    ORDER BY table_name`, [PG_SCHEMA],
)).map((t) => t.table_name);

fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
const gzip = zlib.createGzip({ level: 9 });
gzip.pipe(fs.createWriteStream(SNAPSHOT_PATH));

for (const table of tables) {
  const all = (await rows(`SELECT to_jsonb(t) AS r FROM ${ident(PG_SCHEMA)}.${ident(table)} t`)).map((x) => x.r);
  for (let i = 0; i < Math.max(all.length, 1); i += BATCH) {
    gzip.write(`${JSON.stringify({ table, rows: all.slice(i, i + BATCH) })}\n`);
  }
  console.log(`${table.padEnd(34)} ${all.length}`);
}
await new Promise((resolve) => gzip.end(resolve));
await closePool();
console.log(`wrote ${SNAPSHOT_PATH} (${(fs.statSync(SNAPSHOT_PATH).size / 1e6).toFixed(1)} MB)`);
