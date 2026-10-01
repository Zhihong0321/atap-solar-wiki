type EvidenceSource = {
  fact_id: string; source_id: string | null; relationship: string; publisher: string | null;
  source_title: string | null; canonical_url: string | null; locator: string | null;
  supporting_extract: string | null; accessed_at: string | null; is_captured: boolean | null;
};

type EvidenceIssue = {
  id: string; title: string; resolution_status: string; editorial_conclusion: string | null;
  practical_impact: string | null;
};

export type ClaimEvidenceModel = {
  claim: {
    variant_id: string; statement: string; value_json: unknown; unit: string | null;
    jurisdiction_label: string; customer_class_label: string; programme_label: string | null;
    effective_from: string | null; effective_to: string | null; time_state: string; claim_state: string;
    editorial_reasoning?: string | null;
  };
  evidence: EvidenceSource[];
  issues: EvidenceIssue[];
};

/**
 * Access dates arrive as timestamptz and serialise to UTC. Printing the raw
 * ISO string invites a reader to mistake the zone shift for a different capture
 * date, so the zone is spelled out instead of hidden.
 */
function accessedLabel(value: string | null) {
  if (!value) return '';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return ` · accessed ${value}`;
  const stamp = at.toISOString();
  return ` · accessed ${stamp.slice(0, 10)} ${stamp.slice(11, 16)} UTC`;
}

/**
 * Native <details>/<summary> provides keyboard, touch and screen-reader
 * disclosure behavior without introducing a new visual system.
 *
 * `level` keeps the heading order legal when the panel sits under a claim on a
 * long page; `showStatement` is switched off there because the page has already
 * printed the claim it belongs to.
 */
export function EvidencePanel({ model, level = 2, showStatement = true }: {
  model: ClaimEvidenceModel; level?: 2 | 3 | 4; showStatement?: boolean;
}) {
  const headingId = `evidence-${model.claim.variant_id}`;
  const Heading = `h${level}` as 'h2' | 'h3' | 'h4';
  const SubHeading = `h${Math.min(level + 1, 6)}` as 'h3' | 'h4' | 'h5';
  const IssueHeading = `h${Math.min(level + 2, 6)}` as 'h4' | 'h5' | 'h6';
  return <aside className="wiki-evidence" aria-labelledby={headingId}>
    <Heading id={headingId} className="wiki-evidence-title">Evidence for this claim</Heading>
    {showStatement && <p>{model.claim.statement}</p>}
    <dl className="wiki-scope-list">
      <dt>Jurisdiction</dt><dd>{model.claim.jurisdiction_label}</dd>
      <dt>Customer class</dt><dd>{model.claim.customer_class_label}</dd>
      <dt>Programme</dt><dd>{model.claim.programme_label || 'Not programme-specific'}</dd>
      <dt>Effective period</dt><dd>{model.claim.effective_from || 'Undated'}{model.claim.effective_to ? ` to ${model.claim.effective_to}` : ' — no end date published'}</dd>
      <dt>Claim state</dt><dd>{model.claim.claim_state.replaceAll('_', ' ')}</dd>
    </dl>
    {model.claim.editorial_reasoning && <p className="wiki-reasoning">
      <strong>Review note.</strong> {model.claim.editorial_reasoning}
    </p>}
    {model.evidence.map((item, index) => <details className="wiki-source" key={`${item.fact_id}-${item.source_id || index}`}>
      <summary>
        <span className="wiki-source-name">{item.publisher || 'Unattributed source'} — {item.source_title || item.fact_id}</span>
        <span className={item.is_captured ? 'wiki-capture wiki-capture-ok' : 'wiki-capture wiki-capture-missing'}>
          {item.is_captured ? 'archived copy' : 'no archived copy'}
        </span>
      </summary>
      <p><strong>Locator:</strong> {item.locator || 'No locator recorded'}</p>
      <blockquote>{item.supporting_extract || 'No supporting extract recorded'}</blockquote>
      <p className="wiki-source-meta">
        {item.is_captured ? 'Archived copy captured' : 'Live URL only; no successful archived capture'}
        {accessedLabel(item.accessed_at)}
      </p>
      {item.canonical_url && <p><a href={item.canonical_url} rel="noreferrer noopener nofollow" target="_blank">Open source</a></p>}
      <p className="wiki-source-meta">Raw fact: {item.fact_id} · relationship: {item.relationship}</p>
    </details>)}
    {model.issues.length > 0 && <section className="wiki-claim-issues" aria-label="Known gaps and conflicts">
      <SubHeading>Known gaps and conflicts</SubHeading>
      {model.issues.map((issue) => <article key={issue.id}>
        <IssueHeading>{issue.title}</IssueHeading>
        <p>{issue.editorial_conclusion || issue.practical_impact || 'This issue remains unresolved.'}</p>
        <small>{issue.resolution_status.replaceAll('_', ' ')}</small>
      </article>)}
    </section>}
  </aside>;
}
