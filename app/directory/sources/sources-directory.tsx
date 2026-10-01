'use client';

import { Directory } from '../../wiki/directory';

type Source = {
  id: string; canonical_url: string; title: string; publisher: string; source_type: string | null;
  source_type_raw: string; published_at: string | null; effective_from: string | null;
  effective_to: string | null; accessed_at: string | null; is_captured: boolean;
  capture_error: string | null; content_type: string | null; sha256: string | null; fact_count: number;
};

function accessed(value: string | null) {
  if (!value) return 'access date not recorded';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return `accessed ${value}`;
  return `accessed ${at.toISOString().slice(0, 10)}`;
}

export default function SourcesDirectory() {
  return <Directory<Source>
    title="Source register"
    lead="Every source the research cited — 647 documents and pages, of which 426 have an archived copy on disk and 221 could not be captured."
    provenance="Mirrored from research.sqlite. A source with no archived copy is shown as such: its extracts were quoted from the live page at the time of research and cannot be re-checked against a stored file today."
    endpoint="/api/wiki/sources"
    searchLabel="Title, publisher or URL"
    rowKey={(row) => row.id}
    facets={(data) => {
      const f = data.facets as { types?: Array<{ source_type: string; c: number }> } | undefined;
      return [
        {
          key: 'type', label: 'Source type',
          options: (f?.types || []).map((t) => ({ value: t.source_type, label: t.source_type.replaceAll('_', ' '), count: t.c })),
        },
        {
          key: 'captured', label: 'Archived copy',
          options: [{ value: 'yes', label: 'Captured' }, { value: 'no', label: 'Capture failed' }],
        },
      ];
    }}
    renderRow={(row) => <article className="wiki-card">
      <h2>{row.title || row.canonical_url}</h2>
      <p className="wiki-card-meta">
        {row.publisher}
        {row.source_type ? ` · ${row.source_type.replaceAll('_', ' ')}` : ''}
        {row.published_at ? ` · published ${row.published_at}` : ''}
      </p>
      <p>
        <span className={row.is_captured ? 'wiki-capture wiki-capture-ok' : 'wiki-capture wiki-capture-missing'}>
          {row.is_captured ? 'archived copy' : `no archived copy${row.capture_error ? ` — ${row.capture_error}` : ''}`}
        </span>
        {' '}<span className="wiki-tag">{row.fact_count} {row.fact_count === 1 ? 'fact' : 'facts'}</span>
      </p>
      <dl className="wiki-card-fields">
        <dt>URL</dt>
        <dd><a href={row.canonical_url} rel="noreferrer noopener nofollow" target="_blank">{row.canonical_url}</a></dd>
        {(row.effective_from || row.effective_to) && <>
          <dt>Effective</dt>
          <dd>{row.effective_from || 'undated'}{row.effective_to ? ` to ${row.effective_to}` : ' — no end date'}</dd>
        </>}
      </dl>
      <p className="wiki-source-meta">
        {row.id} · {accessed(row.accessed_at)}
        {row.content_type ? ` · ${row.content_type}` : ''}
        {row.sha256 ? ` · sha256 ${row.sha256.slice(0, 12)}…` : ''}
      </p>
    </article>}
  />;
}
