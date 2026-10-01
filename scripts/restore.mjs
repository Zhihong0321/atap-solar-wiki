/**
 * Rebuilds the wiki database from scratch in DATABASE_URL: drops the `wiki`
 * schema, recreates it from wiki-server/schema.sql, then loads
 * data/wiki-snapshot.jsonl.gz. Safe to re-run; it replaces everything in `wiki`.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { applySchema, query, transaction, rows, closePool } from '../wiki-server/db.mjs';
import { PG_SCHEMA, SNAPSHOT_PATH } from '../wiki-server/config.mjs';

const ident = (name) => `"${name.replace(/"/g, '""')}"`;
const qualified = (table) => `${ident(PG_SCHEMA)}.${ident(table)}`;

if (!fs.existsSync(SNAPSHOT_PATH)) throw new Error(`Snapshot not found: ${SNAPSHOT_PATH}`);

await query(`DROP SCHEMA IF EXISTS ${ident(PG_SCHEMA)} CASCADE`);
await applySchema();
console.log('schema ready');

// Parent tables must load before the tables that reference them.
const tableNames = (await rows(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations'`, [PG_SCHEMA],
)).map((t) => t.table_name);
const edges = await rows(
  `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
     FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.contype = 'f' AND n.nspname = $1`, [PG_SCHEMA],
);
const bare = (name) => name.replace(/^"?[^".]+"?\./, '').replace(/"/g, '');
const deps = new Map(tableNames.map((t) => [t, new Set()]));
for (const { child, parent } of edges) {
  if (bare(child) !== bare(parent) && deps.has(bare(child))) deps.get(bare(child)).add(bare(parent));
}
const order = [];
const done = new Set();
while (order.length < tableNames.length) {
  const ready = tableNames.filter((t) => !done.has(t) && [...deps.get(t)].every((d) => done.has(d) || !deps.has(d)));
  if (!ready.length) throw new Error('Foreign-key cycle between wiki tables; cannot order the load.');
  for (const t of ready.sort()) { order.push(t); done.add(t); }
}

const columns = {};
for (const t of tableNames) {
  columns[t] = (await rows(
    `SELECT column_name, is_identity = 'YES' AS identity
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND is_generated = 'NEVER'
      ORDER BY ordinal_position`, [PG_SCHEMA, t],
  ));
}

const byTable = new Map();
const lines = readline.createInterface({ input: fs.createReadStream(SNAPSHOT_PATH).pipe(zlib.createGunzip()), crlfDelay: Infinity });
for await (const line of lines) {
  if (!line) continue;
  const { table, rows: batch } = JSON.parse(line);
  if (!byTable.has(table)) byTable.set(table, []);
  byTable.get(table).push(...batch);
}
for (const table of byTable.keys()) {
  if (!columns[table]) throw new Error(`Snapshot table "${table}" does not exist in the schema.`);
}

await transaction(async (client) => {
  for (const table of order) {
    const data = byTable.get(table) || [];
    if (!data.length) { console.log(`${table.padEnd(34)} 0`); continue; }
    const cols = columns[table].map((c) => ident(c.column_name)).join(', ');
    const override = columns[table].some((c) => c.identity) ? ' OVERRIDING SYSTEM VALUE' : '';
    for (let i = 0; i < data.length; i += 500) {
      await client.query(
        `INSERT INTO ${qualified(table)} (${cols})${override}
         SELECT ${cols} FROM jsonb_populate_recordset(NULL::${qualified(table)}, $1::jsonb)`,
        [JSON.stringify(data.slice(i, i + 500))],
      );
    }
    console.log(`${table.padEnd(34)} ${data.length}`);
  }
  const sequences = await client.query(
    `SELECT s.relname AS seq, t.relname AS tbl, a.attname AS col
       FROM pg_class s JOIN pg_namespace n ON n.oid = s.relnamespace
       JOIN pg_depend d ON d.objid = s.oid AND d.deptype IN ('a', 'i')
       JOIN pg_class t ON t.oid = d.refobjid
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
      WHERE s.relkind = 'S' AND n.nspname = $1`, [PG_SCHEMA],
  );
  for (const { seq, tbl, col } of sequences.rows) {
    await client.query(
      `SELECT setval($1, GREATEST((SELECT COALESCE(MAX(${ident(col)}), 0) FROM ${qualified(tbl)}), 1),
                     (SELECT COUNT(*) > 0 FROM ${qualified(tbl)}))`,
      [`${ident(PG_SCHEMA)}.${ident(seq)}`],
    );
  }
});
await closePool();
console.log('restore complete');
