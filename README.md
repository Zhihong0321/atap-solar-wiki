# ATAP Solar Research Wiki

Public, read-only wiki of the Malaysian solar PV research corpus (Solar ATAP, SELCO, NEM, metering,
governance, commercial & industrial, ...). Every fact is traceable to the source it came from; raw
research is labelled unreviewed, and reviewed articles (currently *Solar ATAP eligibility*) show
their verified claims and evidence.

- **Site:** Next.js 16 (App Router) + React 19, served from one process.
- **API:** `GET /api/wiki/*` route handler (`wiki-server/router.mjs`), read-only, backed by Postgres.
- **Data:** `data/wiki-snapshot.jsonl.gz` (6 MB, 38 tables) → loaded into Postgres by `npm run db:restore`.
  Structure only lives in `wiki-server/schema.sql`.

## Run it

Needs Node ≥ 22.13 and any Postgres (local, Docker, Railway, Neon, ...).

```bash
npm install
cp .env.example .env.local        # set DATABASE_URL
npm run db:restore                # drops + recreates the `wiki` schema, loads the snapshot
npm run dev                       # http://localhost:38772
```

Production: `npm run build && npm start` (honours `$PORT`). `DATABASE_URL` is read at runtime.
Non-local hosts connect over TLS; set `DATABASE_SSL=false` to turn that off.

`db:restore` is destructive to the `wiki` schema in the target database (it only touches that schema).

## Layout

```
app/                 wiki UI (/wiki, /category/*, /research/*, /directory/*, /programmes/*) + /api/wiki
wiki-server/         read models (SQL), db pool, router, schema.sql
scripts/restore.mjs  schema + snapshot → Postgres
scripts/snapshot.mjs snapshot ← Postgres (maintainer use: refreshes data/)
data/                wiki-snapshot.jsonl.gz
```

## What is deliberately not here

- The research console, queue, researcher runners and any write endpoint.
- Captured media files (about 560 MB) and archived source documents (about 490 MB). The media
  directory lists records and links to each original source page; the files are not republished
  because their rights were recorded as not assessed for publication.

## Refreshing the data

Maintainers regenerate the snapshot from the working corpus database:

```bash
DATABASE_URL=<working db> npm run db:snapshot
```

then commit `data/wiki-snapshot.jsonl.gz` and re-run `db:restore` against the public database.
