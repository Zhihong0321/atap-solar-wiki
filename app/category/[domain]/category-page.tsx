'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../../wiki/directory';

type Article = {
  slug: string; title: string; summary: string | null; last_verified: string | null;
  claim_count: number; path: string;
};
type Packet = {
  id: string; title: string; status: string; original_prompt: string;
  fact_count: number; source_count: number; gap_count: number;
  conflict_count: number; media_count: number;
};
type CategoryModel = {
  domain: {
    id: string; title: string; description: string; packet_count: number; fact_count: number;
    source_count: number; gap_count: number; conflict_count: number; needs_attention: number;
    articles: Article[];
  };
  packets: Packet[];
  sources: Array<{
    id: string; title: string; canonical_url: string; publisher: string;
    is_captured: boolean; fact_count: number;
  }>;
};

export default function CategoryPage({ domainId }: { domainId: string }) {
  const [model, setModel] = useState<CategoryModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`${API}/api/wiki/domains/${encodeURIComponent(domainId)}`)
      .then(async (response) => {
        const body = await response.json() as CategoryModel & { error?: string };
        if (!response.ok) throw new Error(body.error || `Request failed with ${response.status}`);
        return body;
      })
      .then((body) => { if (live) { setModel(body); setError(null); } })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { live = false; };
  }, [domainId]);

  if (error) {
    return <main className="wiki-page">
      <h1>{domainId}</h1>
      <p className="wiki-error" role="alert">This category could not load. Please reload in a moment. ({error})</p>
    </main>;
  }
  if (!model) return <main className="wiki-page"><h1>{domainId}</h1><p>Loading…</p></main>;

  const { domain, packets, sources } = model;

  return <main className="wiki-page wiki-directory">
    <header className="wiki-head">
      <p className="wiki-eyebrow">Research category {domain.id}</p>
      <h1>{domain.title}</h1>
      {domain.description && <p className="wiki-summary">{domain.description}</p>}
      <dl className="wiki-scope" aria-label="Category totals">
        <div><dt>Packets</dt><dd>{domain.packet_count}</dd></div>
        <div><dt>Facts</dt><dd>{domain.fact_count.toLocaleString()}</dd></div>
        <div><dt>Sources</dt><dd>{domain.source_count}</dd></div>
        <div><dt>Recorded gaps</dt><dd>{domain.gap_count}</dd></div>
        <div><dt>Recorded conflicts</dt><dd>{domain.conflict_count}</dd></div>
        <div><dt>Reviewed pages</dt><dd>{domain.articles.length}</dd></div>
      </dl>
    </header>

    <section aria-labelledby="reviewed">
      <h2 id="reviewed">Reviewed pages</h2>
      {domain.articles.length === 0
        ? <p className="wiki-note">
            No reviewed page has been built from this category yet. The research below is
            available in full, but nothing in it has been verified against its captured sources.
          </p>
        : <ul className="wiki-grid">
            {domain.articles.map((article) => <li key={article.slug}><article className="wiki-card">
              <h3><Link href={article.path}>{article.title}</Link></h3>
              {article.summary && <p>{article.summary}</p>}
              <p className="wiki-source-meta">
                {article.claim_count} verified claims
                {article.last_verified ? ` · last reviewed ${article.last_verified}` : ''}
              </p>
            </article></li>)}
          </ul>}
    </section>

    <section aria-labelledby="packets">
      <h2 id="packets">Research packets</h2>
      <div className="wiki-section-lead">
        <p className="wiki-note">
          <strong>Unreviewed research output.</strong> Each packet page shows every fact the two
          research passes recorded, with its sources, locators and quoted extracts.
        </p>
      </div>
      <ul className="wiki-grid">
        {packets.map((packet) => <li key={packet.id}><article className="wiki-card">
          <h3><Link href={`/research/${packet.id}`}>{packet.id} — {packet.title}</Link></h3>
          <p className="wiki-card-meta">{packet.original_prompt.split('\n')[0].slice(0, 200)}</p>
          <p className="wiki-tags">
            <span className="wiki-tag">{packet.fact_count} facts</span>
            <span className="wiki-tag">{packet.source_count} sources</span>
            {packet.gap_count > 0 && <span className="wiki-tag">{packet.gap_count} gaps</span>}
            {packet.conflict_count > 0 && <span className="wiki-tag">{packet.conflict_count} conflicts</span>}
            {packet.media_count > 0 && <span className="wiki-tag">{packet.media_count} files</span>}
            {packet.status !== 'two_pass_complete' && <span className="wiki-tag wiki-tag-warn">
              {packet.status.replaceAll('_', ' ')}
            </span>}
          </p>
        </article></li>)}
      </ul>
    </section>

    <section aria-labelledby="top-sources">
      <h2 id="top-sources">Most-cited sources in this category</h2>
      <ul className="wiki-grid">
        {sources.map((source) => <li key={source.id}><article className="wiki-card">
          <h3>{source.title || source.canonical_url}</h3>
          <p className="wiki-card-meta">{source.publisher}</p>
          <p>
            <span className={source.is_captured ? 'wiki-capture wiki-capture-ok' : 'wiki-capture wiki-capture-missing'}>
              {source.is_captured ? 'archived copy' : 'no archived copy'}
            </span>{' '}
            <span className="wiki-tag">{source.fact_count} facts</span>
          </p>
          <p className="wiki-source-meta">
            <a href={source.canonical_url} rel="noreferrer noopener nofollow" target="_blank">{source.canonical_url}</a>
          </p>
        </article></li>)}
      </ul>
      <p className="wiki-note"><Link href="/directory/sources">See the full source register →</Link></p>
    </section>
  </main>;
}
