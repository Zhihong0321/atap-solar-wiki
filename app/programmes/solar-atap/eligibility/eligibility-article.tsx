'use client';

import { Fragment, useEffect, useState } from 'react';
import { EvidencePanel, type ClaimEvidenceModel } from '../../../wiki/evidence-panel';

const API = '';
const SLUG = 'solar-atap-eligibility';

type Citation = {
  citation_key: string; section_key: string; ordinal: number; render_context: string;
  scope_override_reason: string | null; temporal_override_reason: string | null;
  override_reviewed_by: string | null; variant_id: string; evidence: ClaimEvidenceModel;
};
type Disclosure = {
  issue_id: string; issue_slug: string; title: string; reader_question: string | null;
  reviewed_type: string | null; resolution_status: string; editorial_conclusion: string | null;
  practical_impact: string | null; disclosure_text: string;
};
type Excluded = {
  variant_id: string; statement: string; claim_state: string; customer_class_label: string;
  editorial_reasoning: string | null;
  facts: Array<{ fact_id: string; relationship: string; review_status: string; mapping_reason: string | null }>;
};
type ArticlePage = {
  article: {
    slug: string; title: string; summary: string | null; body_mdx: string; packet_ids: string[];
    last_verified: string | null; effective_from: string | null; effective_to: string | null;
    effective_period_note: string | null; reviewed_by: string | null; reviewed_at: string | null;
    jurisdiction_label: string; customer_class_label: string; programme_label: string | null;
  };
  citations: Citation[];
  disclosures: Disclosure[];
  excluded: Excluded[];
};

// Section keys come from the citation rows. The page prints them in the order
// the citations are numbered, so a new section never needs a code change here.
const SECTION_TITLES: Record<string, string> = {
  scope: 'Where and when this applies',
  'who-can-apply': 'Who can apply',
  exclusions: 'Who cannot apply',
  capacity: 'Capacity limits',
  installation: 'Where the installation may go',
  duration: 'How long participation lasts',
};

/**
 * Renders `[C3]`-style markers in the authored prose as links down to the claim
 * they cite, so every statement in the plain-language answer is traceable
 * without leaving the page.
 */
function withCitationMarkers(text: string) {
  return text.split(/(\[C\d+\])/g).map((part, index) => {
    const marker = /^\[C(\d+)\]$/.exec(part);
    if (!marker) return <Fragment key={index}>{part}</Fragment>;
    const key = `C${marker[1]}`;
    return <a key={index} className="wiki-marker" href={`#claim-${key}`} aria-label={`Evidence for claim ${key}`}>{key}</a>;
  });
}

export default function EligibilityArticle() {
  const [page, setPage] = useState<ArticlePage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`${API}/api/wiki/articles/${SLUG}`)
      .then(async (response) => {
        const body = await response.json() as ArticlePage & { error?: string };
        if (!response.ok) throw new Error(body.error || `Request failed with ${response.status}`);
        return body;
      })
      .then((body) => { if (live) setPage(body); })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { live = false; };
  }, []);

  if (error) {
    return <main className="wiki-page">
      <h1>Solar ATAP eligibility</h1>
      <p className="wiki-error" role="alert">
        This page could not load its evidence, so nothing is shown. Please reload in a moment. ({error})
      </p>
    </main>;
  }
  if (!page) {
    return <main className="wiki-page"><h1>Solar ATAP eligibility</h1><p>Loading evidence…</p></main>;
  }

  const { article, citations, disclosures, excluded } = page;
  const sections: Array<[string, Citation[]]> = [];
  for (const citation of citations) {
    const existing = sections.find(([key]) => key === citation.section_key);
    if (existing) existing[1].push(citation);
    else sections.push([citation.section_key, [citation]]);
  }
  const unresolved = disclosures.filter((d) => d.resolution_status === 'unresolved');

  return <main className="wiki-page">
    <article>
      <header className="wiki-head">
        <p className="wiki-eyebrow">Programmes · {article.programme_label}</p>
        <h1>{article.title}</h1>
        {article.summary && <p className="wiki-summary">{article.summary}</p>}
        <dl className="wiki-scope" aria-label="Scope of this page">
          <div><dt>Jurisdiction</dt><dd>{article.jurisdiction_label}</dd></div>
          <div><dt>Customer class</dt><dd>{article.customer_class_label}</dd></div>
          <div><dt>Programme</dt><dd>{article.programme_label}</dd></div>
          <div>
            <dt>Effective period</dt>
            <dd>{article.effective_from ? `From ${article.effective_from}` : 'Undated'}{article.effective_to ? ` to ${article.effective_to}` : ' — no end date published'}</dd>
          </div>
        </dl>
        {article.effective_period_note && <p className="wiki-note">{article.effective_period_note}</p>}
      </header>

      {unresolved.length > 0 && <section className="wiki-banner" aria-labelledby="wiki-unresolved">
        <h2 id="wiki-unresolved">Unresolved at the time of review</h2>
        <ul>{unresolved.map((issue) => <li key={issue.issue_id}>{issue.disclosure_text}</li>)}</ul>
      </section>}

      <section aria-labelledby="wiki-plain">
        <h2 id="wiki-plain">In plain language</h2>
        {article.body_mdx.split(/\n\s*\n/).map((paragraph, index) => (
          <p key={index}>{withCitationMarkers(paragraph.replace(/\s*\n\s*/g, ' ').trim())}</p>
        ))}
      </section>

      <section aria-labelledby="wiki-rules">
        <h2 id="wiki-rules">Eligibility rules and their evidence</h2>
        <p className="wiki-note">
          Every rule below carries its own jurisdiction, customer class and effective period.
          Open a rule to read the source, the exact locator and the quoted extract behind it.
        </p>
        {sections.map(([sectionKey, group]) => <section key={sectionKey} aria-labelledby={`section-${sectionKey}`}>
          <h3 id={`section-${sectionKey}`}>{SECTION_TITLES[sectionKey] || sectionKey.replaceAll('-', ' ')}</h3>
          {group.map((citation) => {
            const claim = citation.evidence.claim;
            // A scope override is recorded precisely when the claim's customer
            // class is narrower than the page's, so it is the honest trigger
            // for the warning rather than a label comparison.
            const classSpecific = Boolean(citation.scope_override_reason);
            return <section className="wiki-claim" id={`claim-${citation.citation_key}`} key={citation.citation_key}>
              <h4>
                <span className="wiki-claim-key">{citation.citation_key}</span>
                {claim.statement}
              </h4>
              <p className="wiki-claim-scope">
                {claim.jurisdiction_label} · <strong>{claim.customer_class_label}</strong> ·
                {' '}effective from {claim.effective_from || 'an unrecorded date'}
                {claim.effective_to ? ` to ${claim.effective_to}` : ', no end date published'}
              </p>
              {classSpecific && <p className="wiki-scope-warning">
                <strong>Applies to one customer class only.</strong> {citation.scope_override_reason}
              </p>}
              <details className="wiki-claim-evidence">
                <summary>Evidence for {citation.citation_key}</summary>
                <EvidencePanel model={citation.evidence} level={4} showStatement={false} />
              </details>
            </section>;
          })}
        </section>)}
      </section>

      <section aria-labelledby="wiki-limits">
        <h2 id="wiki-limits">Limitations and unresolved issues</h2>
        {disclosures.map((issue) => <section className="wiki-limit" key={issue.issue_id}>
          <h3>{issue.title}</h3>
          {issue.reader_question && <p className="wiki-question">{issue.reader_question}</p>}
          <p>{issue.disclosure_text}</p>
          <p className="wiki-source-meta">
            {issue.resolution_status.replaceAll('_', ' ')}
            {issue.reviewed_type ? ` · ${issue.reviewed_type.replaceAll('_', ' ')}` : ''}
            {' · '}{issue.issue_slug}
          </p>
        </section>)}
      </section>

      <section aria-labelledby="wiki-excluded">
        <h2 id="wiki-excluded">Considered and excluded</h2>
        <p className="wiki-note">
          These statements were reviewed as candidates for this page and rejected. They are kept
          here, blocked from publication, so a rejection cannot quietly disappear.
        </p>
        {excluded.map((item) => <section className="wiki-excluded" key={item.variant_id}>
          <h3>{item.statement}</h3>
          <p className="wiki-source-meta">Not published · {item.claim_state.replaceAll('_', ' ')} · {item.customer_class_label}</p>
          {item.editorial_reasoning && <p>{item.editorial_reasoning}</p>}
          <ul>{item.facts.map((fact) => <li key={`${fact.fact_id}-${fact.relationship}`}>
            <code>{fact.fact_id}</code> — {fact.review_status.replaceAll('_', ' ')}
            {fact.mapping_reason ? `: ${fact.mapping_reason}` : ''}
          </li>)}</ul>
        </section>)}
      </section>

      <footer className="wiki-foot">
        <h2>Review status</h2>
        <dl className="wiki-scope">
          <div><dt>Last reviewed</dt><dd>{article.last_verified || 'Not recorded'}</dd></div>
          <div><dt>Reviewed by</dt><dd>{article.reviewed_by || 'Not recorded'}</dd></div>
          <div><dt>Published claims</dt><dd>{citations.length}</dd></div>
          <div><dt>Rejected candidates</dt><dd>{excluded.length}</dd></div>
        </dl>
        <p className="wiki-note">
          Research packets behind this page: {article.packet_ids.join(', ')}. The candidate-by-candidate
          decisions are recorded in <code>part2-evidence-review.md</code>.
        </p>
      </footer>
    </article>
  </main>;
}
