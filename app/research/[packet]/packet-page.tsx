'use client';

import { useEffect, useState } from 'react';
import { API } from '../../wiki/directory';

type SourceRef = {
  source_id: string; publisher: string; title: string; url: string; locator: string | null;
  supporting_extract: string | null; is_captured: boolean; capture_error: string | null;
  accessed_at: string | null;
};
type ReviewRef = {
  variant_id: string; statement: string; relationship: string; mapping_review_status: string;
  mapping_reason: string | null; publication_status: string; claim_state: string;
};
type Fact = {
  id: string; pass_number: number; field_key: string; value_raw: string | null;
  value_text: string | null; value_json: unknown; unit: string | null;
  jurisdiction_raw: string | null; region: string | null; customer_class: string | null;
  effective_from: string | null; effective_to: string | null; verification_status: string | null;
  derivation_json: unknown; sources: SourceRef[]; review: ReviewRef[];
};
type Field = { field_key: string; corroboration: string; passes: Fact[] };
type EntityGroup = { entity_key: string; entity_name: string | null; fields: Field[] };
type PacketPageModel = {
  packet: {
    id: string; title: string; original_prompt: string; status: string;
    domain_title: string | null; domain_description: string | null; updated_at: string | null;
  };
  entities: EntityGroup[];
  sources: Array<{
    id: string; canonical_url: string; title: string; publisher: string; source_type: string | null;
    is_captured: boolean; capture_error: string | null; fact_count: number;
  }>;
  gaps: Array<{ id: string; description: string; gap_key: string | null; status: string | null; required_input: string | null }>;
  conflicts: Array<{
    id: string; field_key: string | null; description: string; source_urls: string[]; status: string | null;
    issues: Array<{ issue_id: string; slug: string; title: string; resolution_status: string; conclusion: string | null }>;
  }>;
  runs: Array<{ id: string; pass_number: number; researcher: string; researcher_detail: string | null; status: string; completed_at: string | null }>;
  counts: Record<string, number>;
};

const CORROBORATION: Record<string, { label: string; className: string }> = {
  both_passes_agree: { label: 'both passes agree', className: 'wiki-tag wiki-tag-ok' },
  passes_differ: { label: 'passes differ', className: 'wiki-tag wiki-tag-warn' },
  single_pass: { label: 'one pass only', className: 'wiki-tag' },
};

function displayValue(fact: Fact) {
  if (fact.value_raw) {
    try {
      const parsed = JSON.parse(fact.value_raw);
      if (Array.isArray(parsed)) return parsed.join(' · ');
      if (parsed && typeof parsed === 'object') return JSON.stringify(parsed, null, 1);
      return String(parsed);
    } catch { return fact.value_raw; }
  }
  return fact.value_text || '—';
}

export default function PacketPage({ packetId }: { packetId: string }) {
  const [model, setModel] = useState<PacketPageModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`${API}/api/wiki/packets/${encodeURIComponent(packetId)}`)
      .then(async (response) => {
        const body = await response.json() as PacketPageModel & { error?: string };
        if (!response.ok) throw new Error(body.error || `Request failed with ${response.status}`);
        return body;
      })
      .then((body) => { if (live) { setModel(body); setError(null); } })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { live = false; };
  }, [packetId]);

  if (error) {
    return <main className="wiki-page">
      <h1>{packetId}</h1>
      <p className="wiki-error" role="alert">This packet could not load. Please reload in a moment. ({error})</p>
    </main>;
  }
  if (!model) return <main className="wiki-page"><h1>{packetId}</h1><p>Loading…</p></main>;

  const { packet, entities, sources, gaps, conflicts, runs, counts } = model;

  return <main className="wiki-page wiki-directory">
    <header className="wiki-head">
      <p className="wiki-eyebrow">Research packet · {packet.domain_title}</p>
      <h1>{packet.id} — {packet.title}</h1>
      <p className="wiki-note">
        <strong>Unreviewed research output.</strong> These are the values the two research passes
        recorded, with their sources. Nothing on this page has been editorially verified against
        the captured sources unless a review outcome is shown on the individual fact.
      </p>
      <dl className="wiki-scope" aria-label="Packet totals">
        <div><dt>Facts</dt><dd>{counts.facts}</dd></div>
        <div><dt>Subjects</dt><dd>{counts.entities}</dd></div>
        <div><dt>Sources</dt><dd>{counts.sources} ({counts.sources_captured} archived)</dd></div>
        <div><dt>Reviewed facts</dt><dd>{counts.reviewed_facts}</dd></div>
        <div><dt>Recorded gaps</dt><dd>{counts.gaps}</dd></div>
        <div><dt>Recorded conflicts</dt><dd>{counts.conflicts}</dd></div>
      </dl>
      {packet.status !== 'two_pass_complete' && <p className="wiki-scope-warning">
        <strong>Packet status: {packet.status.replaceAll('_', ' ')}.</strong> This packet did not
        finish both research passes cleanly, so its coverage may be incomplete.
      </p>}
    </header>

    <section aria-labelledby="brief">
      <h2 id="brief">What was asked</h2>
      <blockquote className="wiki-prompt">{packet.original_prompt}</blockquote>
      <p className="wiki-source-meta">
        {runs.map((run) => `pass ${run.pass_number} · ${run.researcher}${run.researcher_detail ? ` (${run.researcher_detail})` : ''} · ${run.status}`).join(' — ')}
      </p>
    </section>

    <section aria-labelledby="findings">
      <h2 id="findings">Findings</h2>
      {entities.map((group) => <section className="wiki-entity" key={group.entity_key} id={`entity-${group.entity_key}`}>
        <h3>{group.entity_name || group.entity_key.replaceAll('_', ' ')}</h3>
        <p className="wiki-source-meta">{group.entity_key} · {group.fields.length} recorded {group.fields.length === 1 ? 'field' : 'fields'}</p>
        {group.fields.map((field) => {
          const primary = field.passes[field.passes.length - 1];
          const badge = CORROBORATION[field.corroboration] || CORROBORATION.single_pass;
          return <article className="wiki-fact" key={field.field_key}>
            <h4>{field.field_key.replaceAll('_', ' ')}</h4>
            <p className="wiki-fact-value">{displayValue(primary)}{primary.unit ? ` ${primary.unit}` : ''}</p>
            <p className="wiki-tags">
              <span className={badge.className}>{badge.label}</span>
              {primary.jurisdiction_raw && <span className="wiki-tag">{primary.jurisdiction_raw}</span>}
              {primary.customer_class && <span className="wiki-tag">{primary.customer_class.replaceAll('_', ' ')}</span>}
              <span className="wiki-tag">
                {primary.effective_from ? `from ${primary.effective_from}` : 'undated'}
                {primary.effective_to ? ` to ${primary.effective_to}` : ''}
              </span>
            </p>

            {field.corroboration === 'passes_differ' && <p className="wiki-scope-warning">
              The two research passes recorded different values for this field. Both are shown
              below; neither has been adjudicated unless a review outcome appears.
            </p>}

            {primary.review.length > 0 && <div className="wiki-reviewed">
              {primary.review.map((review) => <p key={review.variant_id}>
                <strong>
                  {review.publication_status === 'eligible' ? 'Published after review.' : 'Reviewed and not published.'}
                </strong>{' '}
                {review.mapping_reason || review.statement}
                {' '}<span className="wiki-source-meta">({review.relationship}, mapping {review.mapping_review_status})</span>
              </p>)}
            </div>}

            {field.passes.map((fact) => <details className="wiki-source" key={fact.id}>
              <summary>
                <span className="wiki-source-name">
                  Pass {fact.pass_number} · {fact.sources.length} {fact.sources.length === 1 ? 'source' : 'sources'}
                  {field.corroboration === 'passes_differ' ? ` · "${displayValue(fact).slice(0, 60)}"` : ''}
                </span>
                <span className="wiki-source-meta">{fact.id}</span>
              </summary>
              {fact.sources.length === 0 && <p className="wiki-source-meta">No source recorded for this fact.</p>}
              {fact.sources.map((source) => <div key={`${source.source_id}-${source.locator}`}>
                <p className="wiki-card-meta">{source.publisher} — {source.title}</p>
                <p><strong>Locator:</strong> {source.locator || 'No locator recorded'}</p>
                {source.supporting_extract && <blockquote>{source.supporting_extract}</blockquote>}
                <p className="wiki-source-meta">
                  <span className={source.is_captured ? 'wiki-capture wiki-capture-ok' : 'wiki-capture wiki-capture-missing'}>
                    {source.is_captured ? 'archived copy' : `no archived copy${source.capture_error ? ` — ${source.capture_error}` : ''}`}
                  </span>{' '}
                  <a href={source.url} rel="noreferrer noopener nofollow" target="_blank">{source.source_id}</a>
                </p>
              </div>)}
              {fact.derivation_json != null && <p className="wiki-source-meta">
                Derived value: <code>{JSON.stringify(fact.derivation_json)}</code>
              </p>}
            </details>)}
          </article>;
        })}
      </section>)}
    </section>

    {conflicts.length > 0 && <section aria-labelledby="conflicts">
      <h2 id="conflicts">Recorded conflicts</h2>
      <p className="wiki-note">Contradictions the research itself flagged. A conflict linked to a reviewed issue has been adjudicated; the rest have not.</p>
      {conflicts.map((conflict) => <article className="wiki-limit" key={conflict.id}>
        <h3>{conflict.field_key || conflict.id}</h3>
        <p>{conflict.description}</p>
        {conflict.issues.map((issue) => <p className="wiki-reviewed" key={issue.issue_id}>
          <strong>Adjudicated — {issue.resolution_status.replaceAll('_', ' ')}.</strong> {issue.conclusion}
        </p>)}
        <p className="wiki-source-meta">{conflict.id} · status {conflict.status || 'open'}</p>
      </article>)}
    </section>}

    {gaps.length > 0 && <section aria-labelledby="gaps">
      <h2 id="gaps">Recorded gaps</h2>
      <p className="wiki-note">What the research could not establish.</p>
      <ul className="wiki-rows">
        {gaps.map((gap) => <li key={gap.id}><article className="wiki-card">
          <p>{gap.description}</p>
          <p className="wiki-source-meta">
            {gap.id}{gap.status ? ` · ${gap.status}` : ''}
            {gap.required_input ? ` · needs: ${gap.required_input}` : ''}
          </p>
        </article></li>)}
      </ul>
    </section>}

    <section aria-labelledby="packet-sources">
      <h2 id="packet-sources">Sources used</h2>
      <ul className="wiki-rows">
        {sources.map((source) => <li key={source.id}><article className="wiki-card">
          <h3>{source.title || source.canonical_url}</h3>
          <p className="wiki-card-meta">{source.publisher}{source.source_type ? ` · ${source.source_type.replaceAll('_', ' ')}` : ''}</p>
          <p>
            <span className={source.is_captured ? 'wiki-capture wiki-capture-ok' : 'wiki-capture wiki-capture-missing'}>
              {source.is_captured ? 'archived copy' : `no archived copy${source.capture_error ? ` — ${source.capture_error}` : ''}`}
            </span>{' '}
            <span className="wiki-tag">{source.fact_count} facts in this packet</span>
          </p>
          <p className="wiki-source-meta">
            <a href={source.canonical_url} rel="noreferrer noopener nofollow" target="_blank">{source.canonical_url}</a> · {source.id}
          </p>
        </article></li>)}
      </ul>
    </section>
  </main>;
}
