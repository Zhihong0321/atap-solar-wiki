/**
 * Read models for the raw research pages.
 *
 * These render the corpus packet by packet: every fact, every source, every gap
 * and every recorded conflict, with lineage attached. They are deliberately NOT
 * articles — nothing here goes through the publication contract, because
 * nothing here has been editorially verified. The pages label themselves as
 * unreviewed research output, which is the honest description of what they are.
 *
 * Where a fact has been reviewed for a published page, the review outcome is
 * attached so a reader can see that a value was checked, qualified or rejected.
 */
import { one, rows } from './db.mjs';

const defaultExecutor = { one, rows };

/** Packet index grouped by research domain, with per-packet counts. */
export async function listPackets(executor = defaultExecutor) {
  const packets = await executor.rows(
    `SELECT p.id,p.map_node_id,p.title,p.status,p.original_prompt,
            m.title AS domain_title,m.description AS domain_description,m.sort_order,
            split_part(p.id,'-',1) AS domain,
            (SELECT count(*)::int FROM facts f WHERE f.packet_id=p.id) AS fact_count,
            (SELECT count(DISTINCT fs.source_id)::int FROM facts f
               JOIN fact_sources fs ON fs.fact_id=f.id WHERE f.packet_id=p.id) AS source_count,
            (SELECT count(*)::int FROM gaps g WHERE g.packet_id=p.id) AS gap_count,
            (SELECT count(*)::int FROM conflicts c WHERE c.packet_id=p.id) AS conflict_count,
            (SELECT count(DISTINCT md.sha256)::int FROM media md
              WHERE md.packet_id=p.id AND md.local_file IS NOT NULL AND md.capture_error IS NULL) AS media_count
       FROM packets p
       LEFT JOIN map_nodes m ON m.id=p.map_node_id
      ORDER BY m.sort_order,m.title,p.id`,
  );
  const domains = [];
  for (const packet of packets) {
    const key = packet.map_node_id || packet.domain;
    let group = domains.find((d) => d.id === key);
    if (!group) {
      group = {
        id: key,
        title: packet.domain_title || packet.domain,
        description: packet.domain_description || '',
        packets: [],
        fact_count: 0,
      };
      domains.push(group);
    }
    group.packets.push(packet);
    group.fact_count += packet.fact_count;
  }
  return { domains, total: packets.length };
}

/**
 * One packet in full. Facts are grouped by the raw entity they describe, which
 * is how the research recorded them, and each fact carries every source
 * reference plus any review outcome from the canonical layer.
 */
export async function getPacket(packetId, executor = defaultExecutor) {
  const packet = await executor.one(
    `SELECT p.id,p.map_node_id,p.title,p.original_prompt,p.status,p.created_at,p.updated_at,
            p.handed_off_at,m.title AS domain_title,m.description AS domain_description
       FROM packets p LEFT JOIN map_nodes m ON m.id=p.map_node_id
      WHERE p.id=$1`,
    [packetId],
  );
  if (!packet) return null;

  const facts = await executor.rows(
    `SELECT f.id,f.pass_number,f.field_key,f.value_raw,f.value_text,f.value_json,f.unit,
            f.jurisdiction_raw,f.region,f.customer_class,f.effective_from,f.effective_to,
            f.verification_status,f.derivation_json,
            e.id AS entity_id,e.entity_key,e.display_name AS entity_name,
            COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
              'source_id',s.id,'publisher',COALESCE(pub.canonical_name,s.publisher_raw),
              'title',s.title,'url',s.canonical_url,'locator',fs.locator,
              'supporting_extract',fs.supporting_extract,'is_captured',s.is_captured,
              'capture_error',s.capture_error,'accessed_at',s.accessed_at
            )) FILTER (WHERE s.id IS NOT NULL),'[]'::jsonb) AS sources,
            COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
              'variant_id',v.id,'statement',v.statement,'relationship',cvf.relationship,
              'mapping_review_status',cvf.review_status,'mapping_reason',cvf.mapping_reason,
              'publication_status',v.publication_status,'claim_state',v.claim_state
            )) FILTER (WHERE v.id IS NOT NULL),'[]'::jsonb) AS review
       FROM facts f
       LEFT JOIN entities e ON e.id=f.entity_id
       LEFT JOIN fact_sources fs ON fs.fact_id=f.id
       LEFT JOIN sources s ON s.id=fs.source_id
       LEFT JOIN publishers pub ON pub.id=s.publisher_id
       LEFT JOIN claim_variant_facts cvf ON cvf.fact_id=f.id
       LEFT JOIN claim_variants v ON v.id=cvf.variant_id
      WHERE f.packet_id=$1
      GROUP BY f.id,e.id,e.entity_key,e.display_name
      ORDER BY COALESCE(e.entity_key,''),f.field_key,f.pass_number`,
    [packetId],
  );

  // Grouped by raw entity so a reader sees "everything known about the domestic
  // consumer" rather than an alphabetical wall of field keys.
  const entities = [];
  for (const fact of facts) {
    const key = fact.entity_key || '(no entity recorded)';
    let group = entities.find((g) => g.entity_key === key);
    if (!group) {
      group = { entity_key: key, entity_id: fact.entity_id, entity_name: fact.entity_name, fields: [] };
      entities.push(group);
    }
    let field = group.fields.find((f) => f.field_key === fact.field_key);
    if (!field) {
      field = { field_key: fact.field_key, passes: [] };
      group.fields.push(field);
    }
    field.passes.push(fact);
  }
  // Two passes that agree are the corpus's own corroboration signal, so it is
  // computed once here rather than re-derived in every consumer.
  for (const group of entities) {
    for (const field of group.fields) {
      const values = [...new Set(field.passes.map((p) => p.value_raw ?? JSON.stringify(p.value_json)))];
      field.corroboration = field.passes.length < 2 ? 'single_pass'
        : values.length === 1 ? 'both_passes_agree' : 'passes_differ';
    }
  }

  const [sources, gaps, conflicts, runs, media] = await Promise.all([
    executor.rows(
      `SELECT DISTINCT s.id,s.canonical_url,s.title,
              COALESCE(p.canonical_name,s.publisher_raw) AS publisher,
              s.source_type,s.is_captured,s.capture_error,s.accessed_at,
              (SELECT count(DISTINCT fs2.fact_id)::int FROM fact_sources fs2
                 JOIN facts f2 ON f2.id=fs2.fact_id
                WHERE fs2.source_id=s.id AND f2.packet_id=$1) AS fact_count
         FROM sources s
         JOIN fact_sources fs ON fs.source_id=s.id
         JOIN facts f ON f.id=fs.fact_id
         LEFT JOIN publishers p ON p.id=s.publisher_id
        WHERE f.packet_id=$1
        ORDER BY s.is_captured DESC,publisher,s.title`,
      [packetId],
    ),
    executor.rows(
      'SELECT id,description,gap_key,status,required_input FROM gaps WHERE packet_id=$1 ORDER BY id',
      [packetId],
    ),
    executor.rows(
      `SELECT c.id,c.field_key,c.description,c.source_urls,c.status,
              COALESCE(jsonb_agg(jsonb_build_object(
                'issue_id',ic.id,'slug',ic.slug,'title',ic.title,
                'resolution_status',ic.resolution_status,'conclusion',ic.editorial_conclusion
              )) FILTER (WHERE ic.id IS NOT NULL),'[]'::jsonb) AS issues
         FROM conflicts c
         LEFT JOIN issue_conflict_memberships m ON m.conflict_id=c.id
         LEFT JOIN issue_clusters ic ON ic.id=m.issue_cluster_id
        WHERE c.packet_id=$1
        GROUP BY c.id ORDER BY c.id`,
      [packetId],
    ),
    executor.rows(
      `SELECT id,pass_number,version,researcher,researcher_detail,status,started_at,completed_at,error
         FROM runs WHERE packet_id=$1 ORDER BY pass_number,version DESC`,
      [packetId],
    ),
    executor.one(
      `SELECT count(DISTINCT sha256)::int AS c FROM media
        WHERE packet_id=$1 AND local_file IS NOT NULL AND capture_error IS NULL`,
      [packetId],
    ),
  ]);

  const counts = {
    facts: facts.length,
    entities: entities.length,
    sources: sources.length,
    sources_captured: sources.filter((s) => s.is_captured).length,
    gaps: gaps.length,
    conflicts: conflicts.length,
    media: media.c,
    reviewed_facts: facts.filter((f) => f.review.length > 0).length,
  };

  return { packet, entities, sources, gaps, conflicts, runs, counts };
}

/**
 * The research categories, exactly as the research map defines them. This is
 * the corpus's own top-level shape, so the wiki uses it as its spine rather
 * than inventing a second taxonomy that would drift from the research.
 */
export async function listDomains(executor = defaultExecutor) {
  const domains = await executor.rows(
    `SELECT m.id,m.title,m.description,m.sort_order,
            count(p.id)::int AS packet_count,
            COALESCE(sum((SELECT count(*) FROM facts f WHERE f.packet_id=p.id)),0)::int AS fact_count,
            COALESCE(sum((SELECT count(*) FROM gaps g WHERE g.packet_id=p.id)),0)::int AS gap_count,
            COALESCE(sum((SELECT count(*) FROM conflicts c WHERE c.packet_id=p.id)),0)::int AS conflict_count,
            count(p.id) FILTER (WHERE p.status <> 'two_pass_complete')::int AS needs_attention
       FROM map_nodes m
       LEFT JOIN packets p ON p.map_node_id=m.id
      GROUP BY m.id,m.title,m.description,m.sort_order
      ORDER BY m.sort_order,m.title`,
  );
  const articles = await executor.rows(
    `SELECT a.slug,a.title,a.summary,a.last_verified,a.packet_ids,a.section,a.programme_code,
            (SELECT count(*)::int FROM article_claim_citations c WHERE c.article_id=a.id) AS claim_count
       FROM articles a WHERE a.status='published' ORDER BY a.sort_order,a.title`,
  );
  // The public route is derived rather than stored: a programme page lives under
  // its programme, and the slug is prefixed with that programme code.
  for (const article of articles) {
    const leaf = article.programme_code && article.slug.startsWith(`${article.programme_code}-`)
      ? article.slug.slice(article.programme_code.length + 1)
      : article.slug;
    article.path = article.programme_code
      ? `/${article.section}/${article.programme_code}/${leaf}`
      : `/${article.section}/${article.slug}`;
  }
  const sourceCounts = await executor.rows(
    `SELECT p.map_node_id AS domain,count(DISTINCT fs.source_id)::int AS c
       FROM packets p JOIN facts f ON f.packet_id=p.id JOIN fact_sources fs ON fs.fact_id=f.id
      GROUP BY 1`,
  );
  for (const domain of domains) {
    domain.source_count = sourceCounts.find((s) => s.domain === domain.id)?.c ?? 0;
    // An article belongs to a category when it cites a packet from it, which is
    // the same link the research itself records.
    domain.articles = articles.filter((a) => a.packet_ids.some((id) => id.startsWith(`${domain.id}-`)));
  }
  return { domains, total: domains.length };
}

/** One research category: its description, its packets and its reviewed pages. */
export async function getDomain(domainId, executor = defaultExecutor) {
  const { domains } = await listDomains(executor);
  const domain = domains.find((d) => d.id === domainId);
  if (!domain) return null;
  const packets = await executor.rows(
    `SELECT p.id,p.title,p.status,p.original_prompt,
            (SELECT count(*)::int FROM facts f WHERE f.packet_id=p.id) AS fact_count,
            (SELECT count(DISTINCT fs.source_id)::int FROM facts f
               JOIN fact_sources fs ON fs.fact_id=f.id WHERE f.packet_id=p.id) AS source_count,
            (SELECT count(*)::int FROM gaps g WHERE g.packet_id=p.id) AS gap_count,
            (SELECT count(*)::int FROM conflicts c WHERE c.packet_id=p.id) AS conflict_count,
            (SELECT count(DISTINCT md.sha256)::int FROM media md
              WHERE md.packet_id=p.id AND md.local_file IS NOT NULL AND md.capture_error IS NULL) AS media_count
       FROM packets p WHERE p.map_node_id=$1 ORDER BY p.id`,
    [domainId],
  );
  const sources = await executor.rows(
    `SELECT s.id,s.title,s.canonical_url,COALESCE(pub.canonical_name,s.publisher_raw) AS publisher,
            s.is_captured,count(DISTINCT f.id)::int AS fact_count
       FROM packets p
       JOIN facts f ON f.packet_id=p.id
       JOIN fact_sources fs ON fs.fact_id=f.id
       JOIN sources s ON s.id=fs.source_id
       LEFT JOIN publishers pub ON pub.id=s.publisher_id
      WHERE p.map_node_id=$1
      GROUP BY s.id,pub.canonical_name,s.publisher_raw
      ORDER BY fact_count DESC LIMIT 12`,
    [domainId],
  );
  return { domain, packets, sources };
}
