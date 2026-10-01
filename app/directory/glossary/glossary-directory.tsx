'use client';

import { Directory } from '../../wiki/directory';

type GlossarySource = {
  source_id: string; publisher: string; title: string; url: string;
  locator: string | null; supporting_extract: string | null; is_captured: boolean;
};
type Term = {
  slug: string; term: string; definition: string; fact_id: string | null;
  packet_id: string | null; packet_title: string | null; sources: GlossarySource[];
};

export default function GlossaryDirectory() {
  return <Directory<Term>
    title="Glossary"
    lead="The defined terms the research extracted, each with the source that defines it."
    provenance="Built from the definition facts in the corpus, chiefly packet GOV-002. These are the definitions as the sources state them; where a regulator and an operator define a term differently, both remain in the corpus and the difference is recorded on the relevant page."
    endpoint="/api/wiki/glossary"
    layout="grid"
    searchLabel="Term or definition"
    rowKey={(row) => row.slug}
    renderRow={(row) => <article className="wiki-card" id={`term-${row.slug}`}>
      <h2>{row.term}</h2>
      <p>{row.definition}</p>
      {row.sources.length > 0 && <details className="wiki-source">
        <summary>
          <span className="wiki-source-name">
            {row.sources.length === 1 ? 'Source' : `${row.sources.length} sources`}
          </span>
        </summary>
        {row.sources.map((source) => <div key={`${source.source_id}-${source.locator}`}>
          <p className="wiki-card-meta">{source.publisher} — {source.title}</p>
          <p><strong>Locator:</strong> {source.locator || 'No locator recorded'}</p>
          {source.supporting_extract && <blockquote>{source.supporting_extract}</blockquote>}
          <p className="wiki-source-meta">
            <span className={source.is_captured ? 'wiki-capture wiki-capture-ok' : 'wiki-capture wiki-capture-missing'}>
              {source.is_captured ? 'archived copy' : 'no archived copy'}
            </span>
            {' '}{source.source_id}
          </p>
          <p><a href={source.url} rel="noreferrer noopener nofollow" target="_blank">Open source</a></p>
        </div>)}
      </details>}
      <p className="wiki-source-meta">
        {row.fact_id ? `raw fact ${row.fact_id}` : 'no raw fact recorded'}
        {row.packet_id ? ` · ${row.packet_id} ${row.packet_title || ''}` : ''}
      </p>
    </article>}
  />;
}
