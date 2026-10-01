'use client';

import { Directory } from '../../wiki/directory';

type Record_ = {
  id: number; occurred_on: string; precision: string; title: string; description: string | null;
  fact_id: string | null; packet_id: string | null; packet_title: string | null;
  field_key: string | null; verification_status: string | null;
};

export default function RecordsDirectory() {
  return <Directory<Record_>
    title="Dated records"
    lead="Every fact in the corpus that carries a date, newest first — statutes, guideline versions, programme announcements, tariff periods and effective dates."
    provenance={
      <>
        Derived from the dated facts in the corpus, chiefly packet GOV-004. Read this as a
        date index, not a curated chronology: a record&apos;s date is the date attached to the
        underlying fact, which is often the date a rule took effect rather than the date
        something happened. Roughly half the entries fall on 2021 and 2026 for that reason.
        Each row names the raw fact so you can check what its date means.
      </>
    }
    endpoint="/api/wiki/timeline"
    searchLabel="Title or description"
    rowKey={(row) => String(row.id)}
    facets={(data) => {
      const f = data.facets as { years?: Array<{ year: string; c: number }> } | undefined;
      return [{
        key: 'from', label: 'Year',
        options: (f?.years || []).map((y) => ({ value: `${y.year}-01-01`, label: y.year, count: y.c })),
      }];
    }}
    renderRow={(row) => <article className="wiki-card">
      <p className="wiki-record-date">
        <time dateTime={row.occurred_on}>{row.occurred_on}</time>
        {row.precision !== 'day' ? ` (${row.precision} precision)` : ''}
      </p>
      <h2>{row.title}</h2>
      {row.description && <p>{row.description}</p>}
      <p className="wiki-source-meta">
        {row.fact_id ? `raw fact ${row.fact_id}` : 'no raw fact recorded'}
        {row.field_key ? ` · ${row.field_key}` : ''}
        {row.verification_status ? ` · ${row.verification_status.replaceAll('_', ' ')}` : ''}
        {row.packet_id ? ` · ${row.packet_id} ${row.packet_title || ''}` : ''}
      </p>
    </article>}
  />;
}
