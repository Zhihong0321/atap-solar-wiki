'use client';

import { useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense, useEffect, useState } from 'react';

export const API = '';

export type Facet = { key: string; label: string; options: Array<{ value: string; label: string; count?: number }> };

type Payload<Row> = { items: Row[]; total: number; limit?: number; offset?: number };

/**
 * One shell for every derived directory. The directories differ only in their
 * endpoint, their filters and how a row is drawn, so paging, search, counts and
 * the empty/failed states are written once and behave identically everywhere.
 *
 * Filters and paging live in component state; the search term is also mirrored
 * into `?q=` so the masthead search can land here and so a searched directory
 * can be linked to.
 */
type DirectoryProps<Row> = Parameters<typeof DirectoryInner<Row>>[0];

/** `useSearchParams` needs a Suspense boundary so the page can still prerender. */
export function Directory<Row>(props: DirectoryProps<Row>) {
  return <Suspense fallback={null}><DirectoryInner {...props} /></Suspense>;
}

function DirectoryInner<Row>({ title, lead, endpoint, provenance, facets, renderRow, rowKey, searchLabel, layout = 'list' }: {
  title: string;
  lead: ReactNode;
  endpoint: string;
  provenance: ReactNode;
  facets?: (payload: Payload<Row> & { facets?: Record<string, unknown> }) => Facet[];
  renderRow: (row: Row) => ReactNode;
  rowKey: (row: Row) => string;
  searchLabel?: string;
  /** Record cards that stay short sit two-up; long or narrative rows stay in one column. */
  layout?: 'list' | 'grid';
}) {
  // The masthead search sends the reader here with `?q=`, which makes a searched
  // directory a linkable address. `useSearchParams` reads it without an effect,
  // so the box can be seeded during the first render instead of after it.
  const urlQuery = useSearchParams().get('q') ?? '';
  const [data, setData] = useState<(Payload<Row> & { facets?: Record<string, unknown> }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(urlQuery);
  const [query, setQuery] = useState(urlQuery);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  const limit = 50;

  // A second masthead search on the route the reader is already on changes the
  // URL without remounting. Adjusting state during render is React's documented
  // answer for that; an effect would set state after paint and cascade renders.
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    setSearch(urlQuery);
    setQuery(urlQuery);
    setOffset(0);
  }

  // The fetch lives in the effect rather than in a callback the effect invokes:
  // state is only ever set from the resolved promise, so a filter change cannot
  // set state during render.
  useEffect(() => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (query) params.set('search', query);
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    let live = true;
    fetch(`${API}${endpoint}?${params}`)
      .then(async (response) => {
        const body = await response.json() as Payload<Row> & { error?: string };
        if (!response.ok) throw new Error(body.error || `Request failed with ${response.status}`);
        return body;
      })
      .then((body) => { if (live) { setData(body); setError(null); } })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { live = false; };
  }, [endpoint, filters, offset, query]);

  const shown = data ? data.items.length : 0;
  const total = data ? data.total : 0;
  const facetList = data && facets ? facets(data) : [];

  return <main className="wiki-page wiki-directory">
    <header className="wiki-head">
      <p className="wiki-eyebrow">Research corpus</p>
      <h1>{title}</h1>
      <p className="wiki-summary">{lead}</p>
      <p className="wiki-note">{provenance}</p>
    </header>

    <form className="wiki-controls" role="search" onSubmit={(event) => {
      event.preventDefault();
      setOffset(0);
      setQuery(search);
      const term = search.trim();
      window.history.replaceState(null, '', term ? `?q=${encodeURIComponent(term)}` : window.location.pathname);
    }}>
      <label>
        <span>{searchLabel || 'Search'}</span>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type and press Enter" />
      </label>
      {facetList.map((facet) => <label key={facet.key}>
        <span>{facet.label}</span>
        <select
          value={filters[facet.key] || ''}
          onChange={(event) => { setOffset(0); setFilters((current) => ({ ...current, [facet.key]: event.target.value })); }}
        >
          <option value="">All</option>
          {facet.options.map((option) => <option key={option.value} value={option.value}>
            {option.label}{option.count === undefined ? '' : ` (${option.count})`}
          </option>)}
        </select>
      </label>)}
      <button type="submit">Search</button>
      {(query || Object.values(filters).some(Boolean)) && <button type="button" onClick={() => {
        setSearch(''); setQuery(''); setFilters({}); setOffset(0);
        window.history.replaceState(null, '', window.location.pathname);
      }}>Clear</button>}
    </form>

    {error && <p className="wiki-error" role="alert">
      This directory could not load. Please reload in a moment. ({error})
    </p>}

    {!error && !data && <p>Loading…</p>}

    {data && <>
      <p className="wiki-count" aria-live="polite">
        {total === 0 ? 'No records match.' : `Showing ${offset + 1}–${offset + shown} of ${total.toLocaleString()}`}
      </p>
      <ul className={layout === 'grid' ? 'wiki-grid' : 'wiki-rows'}>
        {data.items.map((row) => <li key={rowKey(row)}>{renderRow(row)}</li>)}
      </ul>
      {total > limit && <nav className="wiki-pager" aria-label="Pagination">
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(offset - limit, 0))}>Previous</button>
        <span>Page {Math.floor(offset / limit) + 1} of {Math.max(Math.ceil(total / limit), 1)}</span>
        <button type="button" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>Next</button>
      </nav>}
    </>}
  </main>;
}
