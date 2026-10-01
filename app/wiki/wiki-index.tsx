'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from './directory';

type Article = {
  slug: string; title: string; summary: string | null;
  last_verified: string | null; claim_count: number; path: string;
};
type Domain = {
  id: string; title: string; description: string; packet_count: number; fact_count: number;
  source_count: number; gap_count: number; conflict_count: number; needs_attention: number;
  articles: Article[];
};
type Totals = {
  providers: number; service_providers: number; investors: number;
  sources: number; sources_captured: number; glossary: number; timeline: number;
  media: number; facts: number; packets: number; gaps: number; conflicts: number;
  published_articles: number;
};

function n(value: number | undefined) {
  return value === undefined ? '—' : value.toLocaleString();
}

/**
 * The directory cards lead with the figure rather than the prose, because the
 * size of each slice is what tells a reader whether it is worth opening.
 */
function DirectoryCard({ href, count, unit, title, body }: {
  href: string; count: string; unit: string; title: string; body: string;
}) {
  return <article className="wiki-dir-card">
    <p className="wiki-dir-count">{count} <span className="wiki-card-meta">{unit}</span></p>
    <h3><Link href={href}>{title}</Link></h3>
    <p>{body}</p>
  </article>;
}

export default function WikiIndex() {
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch(`${API}/api/wiki/domains`).then((r) => r.json() as Promise<{ domains: Domain[]; error?: string }>),
      fetch(`${API}/api/wiki/totals`).then((r) => r.json() as Promise<Totals & { error?: string }>),
    ])
      .then(([domainBody, totalsBody]) => {
        if (!live) return;
        if (domainBody.error) throw new Error(domainBody.error);
        setDomains(domainBody.domains);
        setTotals(totalsBody);
        setError(null);
      })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { live = false; };
  }, []);

  return <main className="wiki-page wiki-index">
    <header className="wiki-head">
      <p className="wiki-eyebrow">Malaysia solar · source-first record</p>
      <h1>The research corpus, with its provenance intact</h1>
      <p className="wiki-summary">
        {domains ? domains.length : ''} categories, {totals ? n(totals.packets) : ''} research packets and every fact
        traceable to the source it came from — organised the way the research itself was.
      </p>
      {error && <p className="wiki-error" role="alert">
        This page could not load. Please reload in a moment. ({error})
      </p>}
      {totals && <dl className="wiki-scope" aria-label="Corpus totals">
        <div><dt>Categories</dt><dd>{domains ? domains.length : '—'}</dd></div>
        <div><dt>Packets</dt><dd>{n(totals.packets)}</dd></div>
        <div><dt>Facts</dt><dd>{n(totals.facts)}</dd></div>
        <div><dt>Sources</dt><dd>{n(totals.sources)} <small>({n(totals.sources_captured)} archived)</small></dd></div>
        <div><dt>Gaps and conflicts</dt><dd>{n(totals.gaps + totals.conflicts)}</dd></div>
        <div><dt>Reviewed pages</dt><dd>{n(totals.published_articles)}</dd></div>
      </dl>}
    </header>

    <section aria-labelledby="categories">
      <h2 id="categories">Research categories</h2>
      <div className="wiki-section-lead">
        <p className="wiki-note">
          The categories the research was planned and executed against. Open one to see its packets, its sources and any reviewed page built
          from it.
        </p>
        <Link className="wiki-section-link" href="/research">All {totals ? n(totals.packets) : ''} packets →</Link>
      </div>

      {!error && !domains && <p className="wiki-note">Loading…</p>}

      <ul className="wiki-grid">
        {domains?.map((domain) => <li key={domain.id}>
          <article className="wiki-domain-card">
            <div className="wiki-domain-card-body">
              <span className="wiki-domain-code">{domain.id}</span>
              <h3><Link href={`/category/${domain.id}`}>{domain.title}</Link></h3>
              {domain.description && <p className="wiki-card-meta">{domain.description}</p>}
              <dl className="wiki-figures">
                <div><dt>Packets</dt><dd>{domain.packet_count}</dd></div>
                <div><dt>Facts</dt><dd>{n(domain.fact_count)}</dd></div>
                <div><dt>Sources</dt><dd>{domain.source_count}</dd></div>
                <div className={domain.gap_count + domain.conflict_count > 0 ? 'is-warm' : undefined}>
                  <dt>Open items</dt><dd>{domain.gap_count + domain.conflict_count}</dd>
                </div>
              </dl>
            </div>
            {(domain.articles.length > 0 || domain.needs_attention > 0) && <div className="wiki-domain-foot">
              {domain.articles.length > 0 && <p className="wiki-domain-articles">
                Reviewed: {domain.articles.map((article, index) => <span key={article.slug}>
                  {index > 0 && ', '}
                  <Link href={article.path}>{article.title}</Link>
                  {' '}<span className="wiki-source-meta">({article.claim_count} verified claims)</span>
                </span>)}
              </p>}
              {domain.needs_attention > 0 && <span className="wiki-tag wiki-tag-warn">
                {domain.needs_attention} packet{domain.needs_attention === 1 ? '' : 's'} need attention
              </span>}
            </div>}
          </article>
        </li>)}
      </ul>
    </section>

    <section aria-labelledby="directories">
      <h2 id="directories">Cross-cutting directories</h2>
      <div className="wiki-section-lead">
        <p className="wiki-note">
          The same corpus sliced across categories rather than within them. Every row shows the
          raw fact or source it came from. Use the search box above to jump straight into one.
        </p>
      </div>
      <ul className="wiki-grid wiki-grid-narrow">
        <li><DirectoryCard
          href="/directory/providers"
          count={totals ? n(totals.providers) : '—'}
          unit="registered"
          title="SEDA registered providers"
          body={totals
            ? `${n(totals.service_providers)} PV service providers and ${n(totals.investors)} PV investors, searchable by company, state and city.`
            : 'Registered PV service providers and investors, searchable by company, state and city.'}
        /></li>
        <li><DirectoryCard
          href="/directory/sources"
          count={totals ? n(totals.sources) : '—'}
          unit="cited"
          title="Source register"
          body={totals
            ? `Every cited source, ${n(totals.sources_captured)} of them with an archived copy, filterable by type and capture status.`
            : 'Every source the research cited, filterable by type and capture status.'}
        /></li>
        <li><DirectoryCard
          href="/directory/media"
          count={totals ? n(totals.media) : '—'}
          unit="files"
          title="Media library"
          body="Distinct captured files, deduplicated by content hash, each with its rights status."
        /></li>
        <li><DirectoryCard
          href="/directory/records"
          count={totals ? n(totals.timeline) : '—'}
          unit="dated"
          title="Dated records"
          body="Dated facts, newest first, each linked to the raw fact that carries the date."
        /></li>
        <li><DirectoryCard
          href="/directory/glossary"
          count={totals ? n(totals.glossary) : '—'}
          unit="terms"
          title="Glossary"
          body="Defined terms, each shown with the source that defines it."
        /></li>
      </ul>
    </section>

    <footer className="wiki-foot">
      <h2>How to read this</h2>
      <p className="wiki-note">
        A packet page is research output: it has full provenance but no editorial judgement behind
        it, and it says so. A reviewed page is a claim someone checked line by line against the
        captured source, with rejected candidates kept visible. Where the two differ, the reviewed
        page wins.
      </p>
    </footer>
  </main>;
}
