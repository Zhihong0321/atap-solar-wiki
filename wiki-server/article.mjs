import { one, rows } from './db.mjs';
import { getClaimEvidence } from './evidence.mjs';

const defaultExecutor = { one, rows };

/**
 * Returns everything a wiki page needs to render itself honestly: the article
 * and its explicit scope, one evidence model per citation, the reviewed issue
 * disclosures, and the candidates that were considered and rejected.
 *
 * Only published articles are returned. Rejected candidates are read from the
 * blocked claim variants in the same topic, so a rejection cannot disappear by
 * being omitted from the page: it has to be deleted from the database, and the
 * publication contract keeps it from ever rendering as a claim.
 */
export async function getArticlePage(slug, executor = defaultExecutor) {
  const article = await executor.one(
    `SELECT a.id,a.slug,a.lang,a.section,a.title,a.summary,a.body_mdx,a.packet_ids,a.status,
            a.last_verified,a.effective_from,a.effective_to,a.effective_period_note,
            a.reviewed_by,a.reviewed_at,a.updated_at,
            j.code AS jurisdiction_code,j.label AS jurisdiction_label,
            cc.code AS customer_class_code,cc.label AS customer_class_label,
            p.code AS programme_code,p.label AS programme_label,p.programme_state
       FROM articles a
       LEFT JOIN canonical_jurisdictions j ON j.code=a.jurisdiction_code
       LEFT JOIN canonical_customer_classes cc ON cc.code=a.customer_class_code
       LEFT JOIN canonical_programmes p ON p.code=a.programme_code
      WHERE a.slug=$1 AND a.lang=$2 AND a.status='published'`,
    [slug, 'en'],
  );
  if (!article) return null;

  const citationRows = await executor.rows(
    `SELECT c.citation_key,c.section_key,c.ordinal,c.render_context,c.scope_override_reason,
            c.temporal_override_reason,c.override_reviewed_by,c.override_reviewed_at,c.variant_id
       FROM article_claim_citations c
      WHERE c.article_id=$1
      ORDER BY c.ordinal`,
    [article.id],
  );
  const citations = [];
  for (const citation of citationRows) {
    citations.push({ ...citation, evidence: await getClaimEvidence(citation.variant_id, executor) });
  }

  const disclosures = await executor.rows(
    `SELECT d.section_key,d.disclosure_text,d.reviewed_by,d.reviewed_at,
            ic.id AS issue_id,ic.slug AS issue_slug,ic.title,ic.reader_question,
            ic.reviewed_type,ic.resolution_status,ic.editorial_conclusion,ic.practical_impact
       FROM article_issue_disclosures d
       JOIN issue_clusters ic ON ic.id=d.issue_cluster_id
      WHERE d.article_id=$1
      ORDER BY ic.resolution_status,ic.title`,
    [article.id],
  );

  // Candidates considered and rejected. The topics come from the page's own
  // citations rather than from a hard-coded slug, and `publication_status =
  // 'blocked'` is what the fail-closed contract already enforces, so this list
  // can never contain a live claim.
  const topics = [...new Set(citations.map((c) => c.evidence?.claim?.topic_slug).filter(Boolean))];
  const excluded = topics.length === 0 ? [] : await executor.rows(
    `SELECT v.id AS variant_id,v.statement,v.claim_state,v.publication_status,v.editorial_reasoning,
            cc.label AS customer_class_label,
            COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
              'fact_id',cvf.fact_id,'relationship',cvf.relationship,
              'review_status',cvf.review_status,'mapping_reason',cvf.mapping_reason
            )) FILTER (WHERE cvf.fact_id IS NOT NULL),'[]'::jsonb) AS facts
       FROM claim_variants v
       JOIN canonical_claims cl ON cl.id=v.claim_id
       JOIN canonical_customer_classes cc ON cc.code=v.customer_class_code
       LEFT JOIN claim_variant_facts cvf ON cvf.variant_id=v.id
      WHERE cl.topic_slug = ANY($1) AND v.publication_status='blocked'
      GROUP BY v.id,cc.label
      ORDER BY v.statement`,
    [topics],
  );

  return { article, citations, disclosures, excluded };
}
