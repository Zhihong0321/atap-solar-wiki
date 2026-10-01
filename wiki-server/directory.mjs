/**
 * Read models for the derived directories.
 *
 * These render the corpus itself — providers, sources, glossary, dated records
 * and media — rather than editorial claims. Nothing here goes through the
 * publication contract, because nothing here asserts a proposition: every row
 * carries the raw record and its lineage back to a fact or a source, and the
 * pages label the data as research output rather than reviewed content.
 */
import { one, rows } from './db.mjs';

const defaultExecutor = { one, rows };

/** Clamps paging so a hand-edited URL cannot ask for the whole table at once. */
function paging(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const offset = Math.max(Number(options.offset) || 0, 0);
  return { limit, offset };
}

function like(value) {
  return `%${String(value).trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
}

export async function listProviders(options = {}, executor = defaultExecutor) {
  const { limit, offset } = paging(options);
  const filters = ['TRUE'];
  const params = [];
  if (options.dataset) { params.push(options.dataset); filters.push(`dataset=$${params.length}`); }
  if (options.state) { params.push(options.state); filters.push(`state=$${params.length}`); }
  if (options.search) {
    params.push(like(options.search));
    filters.push(`(company_name ILIKE $${params.length} OR city ILIKE $${params.length} OR contact_person ILIKE $${params.length})`);
  }
  const where = filters.join(' AND ');
  const total = (await executor.one(`SELECT count(*)::int AS c FROM providers WHERE ${where}`, params)).c;
  const items = await executor.rows(
    `SELECT id,dataset,seda_uuid,company_name,category_of_company,contact_person,contact_position,
            contact_number,contact_email,website,nature_of_business,service_scope,state,city,
            postcode,street_address,source_fact_id,source_id
       FROM providers WHERE ${where}
      ORDER BY company_name
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  const states = await executor.rows(
    'SELECT COALESCE(state,\'Not recorded\') AS state,count(*)::int AS c FROM providers GROUP BY 1 ORDER BY c DESC',
  );
  const datasets = await executor.rows(
    'SELECT dataset,count(*)::int AS c FROM providers GROUP BY 1 ORDER BY dataset',
  );
  return { items, total, limit, offset, facets: { states, datasets } };
}

export async function listSources(options = {}, executor = defaultExecutor) {
  const { limit, offset } = paging(options);
  const filters = ['TRUE'];
  const params = [];
  if (options.type) { params.push(options.type); filters.push(`s.source_type=$${params.length}`); }
  if (options.captured === 'yes') filters.push('s.is_captured');
  if (options.captured === 'no') filters.push('NOT s.is_captured');
  if (options.search) {
    params.push(like(options.search));
    filters.push(`(s.title ILIKE $${params.length} OR s.publisher_raw ILIKE $${params.length} OR s.canonical_url ILIKE $${params.length})`);
  }
  const where = filters.join(' AND ');
  const total = (await executor.one(`SELECT count(*)::int AS c FROM sources s WHERE ${where}`, params)).c;
  const items = await executor.rows(
    `SELECT s.id,s.canonical_url,s.title,COALESCE(p.canonical_name,s.publisher_raw) AS publisher,
            s.source_type,s.source_type_raw,s.published_at,s.effective_from,s.effective_to,
            s.accessed_at,s.is_captured,s.capture_error,s.content_type,s.sha256,
            (SELECT count(DISTINCT fs.fact_id)::int FROM fact_sources fs WHERE fs.source_id=s.id) AS fact_count
       FROM sources s
       LEFT JOIN publishers p ON p.id=s.publisher_id
      WHERE ${where}
      ORDER BY s.is_captured DESC,COALESCE(p.canonical_name,s.publisher_raw),s.title
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  const types = await executor.rows(
    'SELECT COALESCE(source_type,\'unclassified\') AS source_type,count(*)::int AS c FROM sources GROUP BY 1 ORDER BY c DESC',
  );
  const capture = await executor.one(
    'SELECT count(*) FILTER (WHERE is_captured)::int AS captured,count(*) FILTER (WHERE NOT is_captured)::int AS uncaptured FROM sources',
  );
  return { items, total, limit, offset, facets: { types, capture } };
}

export async function listGlossary(options = {}, executor = defaultExecutor) {
  const params = [];
  let where = 'TRUE';
  if (options.search) {
    params.push(like(options.search));
    where = `(g.term ILIKE $1 OR g.definition ILIKE $1)`;
  }
  const items = await executor.rows(
    `SELECT g.slug,g.term,g.definition,g.fact_id,g.packet_id,pk.title AS packet_title,
            COALESCE(jsonb_agg(jsonb_build_object(
              'source_id',s.id,'publisher',COALESCE(pub.canonical_name,s.publisher_raw),
              'title',s.title,'url',s.canonical_url,'locator',fs.locator,
              'supporting_extract',fs.supporting_extract,'is_captured',s.is_captured
            ) ORDER BY s.id) FILTER (WHERE s.id IS NOT NULL),'[]'::jsonb) AS sources
       FROM glossary g
       LEFT JOIN packets pk ON pk.id=g.packet_id
       LEFT JOIN fact_sources fs ON fs.fact_id=g.fact_id
       LEFT JOIN sources s ON s.id=fs.source_id
       LEFT JOIN publishers pub ON pub.id=s.publisher_id
      WHERE ${where}
      GROUP BY g.slug,g.term,g.definition,g.fact_id,g.packet_id,pk.title
      ORDER BY g.term`,
    params,
  );
  return { items, total: items.length };
}

export async function listTimeline(options = {}, executor = defaultExecutor) {
  const { limit, offset } = paging(options);
  const filters = ['TRUE'];
  const params = [];
  if (options.from) { params.push(options.from); filters.push(`t.occurred_on >= $${params.length}::date`); }
  if (options.to) { params.push(options.to); filters.push(`t.occurred_on <= $${params.length}::date`); }
  if (options.search) { params.push(like(options.search)); filters.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`); }
  const where = filters.join(' AND ');
  const total = (await executor.one(`SELECT count(*)::int AS c FROM timeline t WHERE ${where}`, params)).c;
  const items = await executor.rows(
    `SELECT t.id,t.occurred_on,t.precision,t.title,t.description,t.fact_id,t.packet_id,
            pk.title AS packet_title,f.field_key,f.verification_status
       FROM timeline t
       LEFT JOIN packets pk ON pk.id=t.packet_id
       LEFT JOIN facts f ON f.id=t.fact_id
      WHERE ${where}
      ORDER BY t.occurred_on DESC,t.title
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  const years = await executor.rows(
    'SELECT to_char(occurred_on,\'YYYY\') AS year,count(*)::int AS c FROM timeline GROUP BY 1 ORDER BY 1 DESC',
  );
  return { items, total, limit, offset, facets: { years } };
}

export async function listMedia(options = {}, executor = defaultExecutor) {
  const { limit, offset } = paging(options);
  const filters = ['m.local_file IS NOT NULL', 'm.capture_error IS NULL'];
  const params = [];
  if (options.packet) { params.push(options.packet); filters.push(`m.packet_id=$${params.length}`); }
  if (options.search) { params.push(like(options.search)); filters.push(`(m.caption ILIKE $${params.length} OR m.asset_url ILIKE $${params.length})`); }
  const where = filters.join(' AND ');
  // 9,361 rows collapse to 2,883 files. The directory shows one card per file
  // and says how many records point at it, rather than repeating duplicates.
  const total = (await executor.one(
    `SELECT count(DISTINCT m.sha256)::int AS c FROM media m WHERE ${where}`, params,
  )).c;
  const items = await executor.rows(
    `SELECT DISTINCT ON (m.sha256) m.id,m.sha256,m.asset_url,m.source_page_url,m.mime_type,m.bytes,
            m.caption,m.rights_status,m.publication_permission,m.packet_id,m.source_id,
            (SELECT count(*)::int FROM media d WHERE d.sha256=m.sha256) AS duplicate_count
       FROM media m
      WHERE ${where}
      ORDER BY m.sha256,m.id
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  const packets = await executor.rows(
    `SELECT m.packet_id,pk.title,count(DISTINCT m.sha256)::int AS c
       FROM media m LEFT JOIN packets pk ON pk.id=m.packet_id
      WHERE m.local_file IS NOT NULL AND m.capture_error IS NULL
      GROUP BY 1,2 ORDER BY c DESC`,
  );
  return { items, total, limit, offset, facets: { packets } };
}

/** Counts for the wiki index, so the landing page never invents a number. */
export async function directoryTotals(executor = defaultExecutor) {
  return executor.one(
    `SELECT (SELECT count(*) FROM providers)::int AS providers,
            (SELECT count(*) FROM providers WHERE dataset='service_provider')::int AS service_providers,
            (SELECT count(*) FROM providers WHERE dataset='investor')::int AS investors,
            (SELECT count(*) FROM sources)::int AS sources,
            (SELECT count(*) FROM sources WHERE is_captured)::int AS sources_captured,
            (SELECT count(*) FROM glossary)::int AS glossary,
            (SELECT count(*) FROM timeline)::int AS timeline,
            (SELECT count(DISTINCT sha256) FROM media WHERE local_file IS NOT NULL AND capture_error IS NULL)::int AS media,
            (SELECT count(*) FROM facts)::int AS facts,
            (SELECT count(*) FROM packets)::int AS packets,
            (SELECT count(*) FROM gaps)::int AS gaps,
            (SELECT count(*) FROM conflicts)::int AS conflicts,
            (SELECT count(*) FROM articles WHERE status='published')::int AS published_articles`,
  );
}
