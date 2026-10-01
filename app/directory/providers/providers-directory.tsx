'use client';

import { Directory } from '../../wiki/directory';

type Provider = {
  id: number; dataset: string; seda_uuid: string; company_name: string;
  category_of_company: string | null; contact_person: string | null; contact_position: string | null;
  contact_number: string | null; contact_email: string | null; website: string | null;
  nature_of_business: string[]; service_scope: string[]; state: string | null; city: string | null;
  postcode: string | null; street_address: string | null; source_fact_id: string | null; source_id: string | null;
};

const DATASET_LABELS: Record<string, string> = {
  service_provider: 'Registered PV service provider (RPVSP)',
  investor: 'Registered PV investor (RPVI)',
};

function externalHref(website: string) {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

export default function ProvidersDirectory() {
  return <Directory<Provider>
    title="SEDA registered providers"
    lead="Every company on SEDA Malaysia's registered rosters — 436 PV service providers and 368 PV investors — as captured by the research run."
    provenance="Exploded from the array-valued facts in packets PROV-001, PROV-003 and PROV-006. Each entry links back to the raw fact and source it came from. Contact details are published as SEDA publishes them; they are not verified independently and may be out of date."
    endpoint="/api/wiki/providers"
    layout="grid"
    searchLabel="Company, city or contact"
    rowKey={(row) => `${row.dataset}-${row.seda_uuid}`}
    facets={(data) => {
      const f = data.facets as { states?: Array<{ state: string; c: number }>; datasets?: Array<{ dataset: string; c: number }> } | undefined;
      return [
        {
          key: 'dataset', label: 'Roster',
          options: (f?.datasets || []).map((d) => ({ value: d.dataset, label: DATASET_LABELS[d.dataset] || d.dataset, count: d.c })),
        },
        {
          key: 'state', label: 'State',
          options: (f?.states || []).filter((s) => s.state !== 'Not recorded').map((s) => ({ value: s.state, label: s.state, count: s.c })),
        },
      ];
    }}
    renderRow={(row) => <article className="wiki-card">
      <h2>{row.company_name}</h2>
      <p className="wiki-card-meta">
        {DATASET_LABELS[row.dataset] || row.dataset}
        {row.category_of_company ? ` · ${row.category_of_company}` : ''}
        {row.state ? ` · ${row.state}` : ''}
        {row.city ? `, ${row.city}` : ''}
      </p>
      {(row.nature_of_business?.length > 0 || row.service_scope?.length > 0) && <p className="wiki-tags">
        {[...new Set([...(row.nature_of_business || []), ...(row.service_scope || [])])].map((tag) => (
          <span className="wiki-tag" key={tag}>{tag}</span>
        ))}
      </p>}
      <dl className="wiki-card-fields">
        {row.contact_person && <><dt>Contact</dt><dd>{row.contact_person}{row.contact_position ? `, ${row.contact_position}` : ''}</dd></>}
        {row.contact_number && <><dt>Phone</dt><dd>{row.contact_number}</dd></>}
        {row.contact_email && <><dt>Email</dt><dd><a href={`mailto:${row.contact_email}`}>{row.contact_email}</a></dd></>}
        {row.website && <><dt>Website</dt><dd><a href={externalHref(row.website)} rel="noreferrer noopener nofollow" target="_blank">{row.website}</a></dd></>}
        {(row.street_address || row.postcode) && <><dt>Address</dt><dd>{[row.street_address, row.postcode, row.city, row.state].filter(Boolean).join(', ')}</dd></>}
      </dl>
      <p className="wiki-source-meta">
        SEDA id {row.seda_uuid}
        {row.source_fact_id ? ` · raw fact ${row.source_fact_id}` : ''}
        {row.source_id ? ` · source ${row.source_id}` : ''}
      </p>
    </article>}
  />;
}
