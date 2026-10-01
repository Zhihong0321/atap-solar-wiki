'use client';

import { Directory } from '../../wiki/directory';

type MediaItem = {
  id: string; sha256: string | null; asset_url: string; source_page_url: string | null;
  mime_type: string | null; bytes: number | null; caption: string | null;
  rights_status: string | null; publication_permission: string | null;
  packet_id: string | null; source_id: string | null; duplicate_count: number;
};

function size(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MediaDirectory() {
  return <Directory<MediaItem>
    title="Media library"
    lead="The 2,883 distinct files the research captured — diagrams, datasheets, tariff tables and product images — deduplicated from 9,361 records by content hash."
    provenance="This site lists the captured files as records only; the files themselves are not republished here. Open the source page to see the original. Rights status is recorded as the research captured it; treat anything without an explicit permission as not cleared for republication."
    endpoint="/api/wiki/media"
    layout="grid"
    searchLabel="Caption or asset URL"
    rowKey={(row) => row.sha256 || row.id}
    facets={(data) => {
      const f = data.facets as { packets?: Array<{ packet_id: string; title: string; c: number }> } | undefined;
      return [{
        key: 'packet', label: 'Packet',
        options: (f?.packets || []).map((p) => ({ value: p.packet_id, label: `${p.packet_id} ${p.title || ''}`.trim(), count: p.c })),
      }];
    }}
    renderRow={(row) => <article className="wiki-card wiki-media-card">
      <p className="wiki-media-placeholder">{row.mime_type || 'unknown type'} · file not republished here</p>
      <div>
        <h2>{row.caption || 'No caption recorded'}</h2>
        <p className="wiki-card-meta">
          {row.mime_type || 'unknown type'}
          {row.bytes ? ` · ${size(row.bytes)}` : ''}
          {row.duplicate_count > 1 ? ` · ${row.duplicate_count} records point at this file` : ''}
        </p>
        <p>
          <span className="wiki-tag">{row.rights_status || 'rights not recorded'}</span>
          {row.publication_permission && <span className="wiki-tag">{row.publication_permission}</span>}
        </p>
        <p className="wiki-source-meta">
          {row.source_page_url && <><a href={row.source_page_url} rel="noreferrer noopener nofollow" target="_blank">Source page</a></>}
        </p>
        <p className="wiki-source-meta">
          {row.id}{row.packet_id ? ` · ${row.packet_id}` : ''}{row.source_id ? ` · ${row.source_id}` : ''}
        </p>
      </div>
    </article>}
  />;
}
