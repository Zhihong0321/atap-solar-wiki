'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../wiki/directory';

type Packet = {
  id: string; title: string; status: string; fact_count: number; source_count: number;
  gap_count: number; conflict_count: number; media_count: number;
};
type Domain = { id: string; title: string; description: string; packets: Packet[]; fact_count: number };

const STATUS_LABELS: Record<string, string> = {
  two_pass_complete: 'two passes complete',
  needs_attention: 'needs attention',
};

export default function ResearchIndex() {
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`${API}/api/wiki/packets`)
      .then(async (response) => {
        const body = await response.json() as { domains: Domain[]; error?: string };
        if (!response.ok) throw new Error(body.error || `Request failed with ${response.status}`);
        return body;
      })
      .then((body) => { if (live) { setDomains(body.domains); setError(null); } })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { live = false; };
  }, []);

  const totalFacts = domains ? domains.reduce((sum, d) => sum + d.fact_count, 0) : 0;
  const totalPackets = domains ? domains.reduce((sum, d) => sum + d.packets.length, 0) : 0;

  return <main className="wiki-page wiki-directory">
    <header className="wiki-head">
      <p className="wiki-eyebrow">Research corpus</p>
      <h1>Research packets</h1>
      <p className="wiki-summary">
        The complete research output, packet by packet. Every fact the two research passes
        produced, with its sources, locators, extracts, recorded gaps and recorded conflicts.
      </p>
      <p className="wiki-note">
        <strong>This is unreviewed research output.</strong> A packet page shows what the
        research found, not what an editor verified. Values are shown with the corroboration
        signal from the two passes and with every source reference, so you can judge each one.
        Where a fact was later reviewed for a published page, the review outcome is shown on it.
      </p>
      {domains && <dl className="wiki-scope" aria-label="Corpus totals">
        <div><dt>Domains</dt><dd>{domains.length}</dd></div>
        <div><dt>Packets</dt><dd>{totalPackets}</dd></div>
        <div><dt>Facts</dt><dd>{totalFacts.toLocaleString()}</dd></div>
      </dl>}
    </header>

    {error && <p className="wiki-error" role="alert">
      The packet index could not load. Please reload in a moment. ({error})
    </p>}
    {!error && !domains && <p>Loading…</p>}

    {domains?.map((domain) => <section key={domain.id} aria-labelledby={`domain-${domain.id}`}>
      <h2 id={`domain-${domain.id}`}>{domain.title}</h2>
      {domain.description && <p className="wiki-note">{domain.description}</p>}
      <p className="wiki-count">{domain.packets.length} packets · {domain.fact_count.toLocaleString()} facts</p>
      <ul className="wiki-grid">
        {domain.packets.map((packet) => <li key={packet.id}>
          <article className="wiki-card">
            <h3><Link href={`/research/${packet.id}`}>{packet.id} — {packet.title}</Link></h3>
            <p className="wiki-tags">
              <span className="wiki-tag">{packet.fact_count} facts</span>
              <span className="wiki-tag">{packet.source_count} sources</span>
              {packet.gap_count > 0 && <span className="wiki-tag">{packet.gap_count} gaps</span>}
              {packet.conflict_count > 0 && <span className="wiki-tag">{packet.conflict_count} conflicts</span>}
              {packet.media_count > 0 && <span className="wiki-tag">{packet.media_count} files</span>}
              {packet.status !== 'two_pass_complete' && <span className="wiki-tag wiki-tag-warn">
                {STATUS_LABELS[packet.status] || packet.status.replaceAll('_', ' ')}
              </span>}
            </p>
          </article>
        </li>)}
      </ul>
    </section>)}
  </main>;
}
