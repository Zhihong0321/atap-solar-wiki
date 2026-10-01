import { one, rows } from './db.mjs';

const defaultExecutor = { one, rows };

/**
 * Returns a reviewed issue together with every raw conflict/fact membership and
 * its durable Codex decision. Both resolved and unresolved states use the same
 * shape so API consumers cannot accidentally hide the latter.
 */
export async function getIssueDecision(reference, executor = defaultExecutor) {
  const issue = await executor.one(
    `SELECT ic.id,ic.slug,ic.title,ic.reader_question,ic.proposed_type,ic.reviewed_type,
            ic.resolution_status,ic.editorial_conclusion,ic.practical_impact,
            ic.review_status,ic.reviewed_by,ic.reviewed_at,
            j.code AS jurisdiction_code,j.label AS jurisdiction_label,
            cc.code AS customer_class_code,cc.label AS customer_class_label,
            p.code AS programme_code,p.label AS programme_label
       FROM issue_clusters ic
       LEFT JOIN canonical_jurisdictions j ON j.code=ic.jurisdiction_code
       LEFT JOIN canonical_customer_classes cc ON cc.code=ic.customer_class_code
       LEFT JOIN canonical_programmes p ON p.code=ic.programme_code
      WHERE ic.id=$1 OR ic.slug=$1`,
    [reference],
  );
  if (!issue) return null;

  const conflicts = await executor.rows(
    `SELECT c.id,c.packet_id,c.field_key,c.description,c.source_urls,c.status,
            m.proposed_type,m.rationale,m.review_status
       FROM issue_conflict_memberships m
       JOIN conflicts c ON c.id=m.conflict_id
      WHERE m.issue_cluster_id=$1
      ORDER BY c.id`,
    [issue.id],
  );
  const facts = await executor.rows(
    `SELECT f.id,f.packet_id,e.entity_key,f.field_key,f.value_json,f.unit,
            f.jurisdiction_raw,f.effective_from,f.effective_to,
            m.relationship,m.rationale,m.review_status,
            COALESCE(jsonb_agg(jsonb_build_object(
              'source_id',s.id,'publisher',COALESCE(p.canonical_name,s.publisher_raw),
              'title',s.title,'url',s.canonical_url,'locator',fs.locator,
              'supporting_extract',fs.supporting_extract,'is_captured',s.is_captured
            ) ORDER BY s.id) FILTER (WHERE s.id IS NOT NULL),'[]'::jsonb) AS sources
       FROM issue_fact_memberships m
       JOIN facts f ON f.id=m.fact_id
       LEFT JOIN entities e ON e.id=f.entity_id
       LEFT JOIN fact_sources fs ON fs.fact_id=f.id
       LEFT JOIN sources s ON s.id=fs.source_id
       LEFT JOIN publishers p ON p.id=s.publisher_id
      WHERE m.issue_cluster_id=$1
      GROUP BY f.id,e.entity_key,m.relationship,m.rationale,m.review_status
      ORDER BY f.id`,
    [issue.id],
  );
  const decisions = await executor.rows(
    `SELECT id,decision,evidence_considered,alternatives_rejected,risks,
            rollback_implications,validation_performed,decided_by,decided_at
       FROM canonical_decisions
      WHERE subject_type='issue_cluster' AND subject_id=$1
      ORDER BY decided_at DESC,id`,
    [issue.id],
  );
  return { issue, conflicts, facts, decisions };
}
