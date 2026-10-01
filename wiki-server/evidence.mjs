import { one, rows } from './db.mjs';

const defaultExecutor = { one, rows };

/**
 * Returns the complete evidence-panel view model for one scoped claim variant.
 * Extracts are evidence, not prose: consumers should keep each source body
 * collapsed by default and expose it with a native disclosure control.
 */
export async function getClaimEvidence(variantId, executor = defaultExecutor) {
  const claim = await executor.one(
    `SELECT v.id AS variant_id,v.statement,v.value_json,v.unit,v.effective_from,v.effective_to,
            v.time_state,v.claim_state,v.review_status,v.publication_status,v.editorial_reasoning,
            c.id AS claim_id,c.slug,c.topic_slug,e.id AS entity_id,e.display_name AS entity_name,
            a.id AS attribute_id,a.attribute_key,a.label AS attribute_label,
            j.code AS jurisdiction_code,j.label AS jurisdiction_label,
            cc.code AS customer_class_code,cc.label AS customer_class_label,
            p.code AS programme_code,p.label AS programme_label
       FROM claim_variants v
       JOIN canonical_claims c ON c.id=v.claim_id
       JOIN canonical_entities e ON e.id=c.canonical_entity_id
       JOIN canonical_attributes a ON a.id=c.attribute_id
       JOIN canonical_jurisdictions j ON j.code=v.jurisdiction_code
       JOIN canonical_customer_classes cc ON cc.code=v.customer_class_code
       LEFT JOIN canonical_programmes p ON p.code=v.programme_code
      WHERE v.id=$1`,
    [variantId],
  );
  if (!claim) return null;

  const evidence = await executor.rows(
    `SELECT cvf.relationship,cvf.is_primary,cvf.review_status AS mapping_review_status,
            f.id AS fact_id,f.packet_id,f.field_key,f.value_json AS fact_value,f.value_raw,
            f.unit AS fact_unit,f.jurisdiction_raw,f.effective_from AS fact_effective_from,
            f.effective_to AS fact_effective_to,f.verification_status,
            s.id AS source_id,s.publisher_raw,COALESCE(p.canonical_name,s.publisher_raw) AS publisher,
            s.title AS source_title,s.canonical_url,s.source_type,s.accessed_at,s.is_captured,
            s.capture_error,fs.locator,fs.supporting_extract
       FROM claim_variant_facts cvf
       JOIN facts f ON f.id=cvf.fact_id
       LEFT JOIN fact_sources fs ON fs.fact_id=f.id
       LEFT JOIN sources s ON s.id=fs.source_id
       LEFT JOIN publishers p ON p.id=s.publisher_id
      WHERE cvf.variant_id=$1
      ORDER BY CASE cvf.relationship WHEN 'supporting' THEN 0 WHEN 'derived_input' THEN 1
               WHEN 'disagreeing' THEN 2 ELSE 3 END,
               cvf.is_primary DESC,s.id,f.id`,
    [variantId],
  );

  const issues = await executor.rows(
    `SELECT ic.id,ic.slug,ic.title,ic.reader_question,ic.reviewed_type,ic.proposed_type,
            ic.resolution_status,ic.editorial_conclusion,ic.practical_impact,cvi.relationship,
            ARRAY(SELECT igm.gap_id FROM issue_gap_memberships igm WHERE igm.issue_cluster_id=ic.id ORDER BY igm.gap_id) AS gap_ids,
            ARRAY(SELECT icm.conflict_id FROM issue_conflict_memberships icm WHERE icm.issue_cluster_id=ic.id ORDER BY icm.conflict_id) AS conflict_ids,
            ARRAY(SELECT ifm.fact_id FROM issue_fact_memberships ifm WHERE ifm.issue_cluster_id=ic.id ORDER BY ifm.fact_id) AS fact_ids
       FROM claim_variant_issues cvi
       JOIN issue_clusters ic ON ic.id=cvi.issue_cluster_id
      WHERE cvi.variant_id=$1 AND cvi.review_status <> 'rejected'
      ORDER BY ic.title`,
    [variantId],
  );

  return { claim, evidence, issues };
}
