'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Site chrome for every wiki route.
 */

const NAV = [
  { href: '/wiki', label: 'Overview' },
  { href: '/wiki#categories', label: 'Categories', match: '/category' },
  { href: '/research', label: 'Packets' },
  { href: '/directory/providers', label: 'Providers' },
  { href: '/directory/sources', label: 'Sources' },
  { href: '/directory/media', label: 'Media' },
  { href: '/directory/records', label: 'Records' },
  { href: '/directory/glossary', label: 'Glossary' },
];

// The corpus has no cross-cutting search endpoint, so the masthead search picks a
// directory rather than pretending to search everything. Each target reads `q`
// from the URL, which also makes a filtered directory linkable.
const SCOPES = [
  { value: 'sources', label: 'sources' },
  { value: 'providers', label: 'providers' },
  { value: 'glossary', label: 'glossary' },
  { value: 'records', label: 'dated records' },
  { value: 'media', label: 'media' },
];

const CRUMB_LABELS: Record<string, string> = {
  category: 'Categories',
  directory: 'Directories',
  research: 'Packets',
  programmes: 'Programmes',
  providers: 'Providers',
  sources: 'Sources',
  media: 'Media',
  records: 'Dated records',
  glossary: 'Glossary',
  'solar-atap': 'Solar ATAP',
  eligibility: 'Eligibility',
};

function label(segment: string) {
  if (CRUMB_LABELS[segment]) return CRUMB_LABELS[segment];
  // Category codes and packet ids are identifiers, not slugs: GOV-001 must not
  // become "GOV 001". Everything else is a slug and reads better unhyphenated.
  if (/^[A-Z]{2,}(-\d+)?$/.test(segment)) return segment;
  return segment.replaceAll('-', ' ');
}

/** Breadcrumbs are derived from the path so no page has to declare them. */
function crumbs(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0 || segments[0] === 'wiki') return [];
  const trail: Array<{ label: string; href?: string }> = [];
  if (segments[0] === 'category') trail.push({ label: 'Categories', href: '/wiki#categories' });
  else if (segments[0] === 'directory') trail.push({ label: 'Directories', href: '/wiki#directories' });
  else if (segments[0] === 'research') trail.push({ label: 'Packets', href: '/research' });
  else trail.push({ label: label(segments[0]) });

  for (const segment of segments.slice(1)) trail.push({ label: label(segment) });
  return trail;
}

export default function WikiShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/wiki';
  const router = useRouter();
  const [scope, setScope] = useState('sources');
  const [term, setTerm] = useState('');
  const trail = crumbs(pathname);

  const isActive = (item: (typeof NAV)[number]) => {
    const base = item.href.split('#')[0];
    if (item.match) return pathname.startsWith(item.match);
    if (base === '/wiki') return pathname === '/wiki';
    return pathname === base || pathname.startsWith(`${base}/`);
  };

  return <div className="wiki-shell">
    <a className="wiki-skip" href="#wiki-main">Skip to content</a>

    <header className="wiki-masthead">
      <div className="wiki-masthead-inner">
        <Link className="wiki-wordmark" href="/wiki">
          <span className="wiki-wordmark-mark" aria-hidden="true" />
          <span>
            <b>ATAP Solar</b>
            <small>Research wiki</small>
          </span>
        </Link>

        <form
          className="wiki-masthead-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const query = term.trim();
            router.push(`/directory/${scope}${query ? `?q=${encodeURIComponent(query)}` : ''}`);
          }}
        >
          <label className="wiki-visually-hidden" htmlFor="wiki-search-scope">Search within</label>
          <select id="wiki-search-scope" value={scope} onChange={(event) => setScope(event.target.value)}>
            {SCOPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <label className="wiki-visually-hidden" htmlFor="wiki-search-term">Search term</label>
          <input
            id="wiki-search-term"
            type="search"
            value={term}
            placeholder="Search the corpus"
            onChange={(event) => setTerm(event.target.value)}
          />
          <button type="submit">Search</button>
        </form>
      </div>

      <nav className="wiki-nav" aria-label="Wiki sections">
        <ul>
          {NAV.map((item) => <li key={item.label}>
            <Link href={item.href} aria-current={isActive(item) ? 'page' : undefined}>{item.label}</Link>
          </li>)}
        </ul>
      </nav>
    </header>

    {trail.length > 0 && <nav className="wiki-crumbs" aria-label="Breadcrumb">
      <ol>
        <li><Link href="/wiki">Wiki</Link></li>
        {trail.map((crumb, index) => <li key={`${crumb.label}-${index}`}>
          {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span>{crumb.label}</span>}
        </li>)}
      </ol>
    </nav>}

    <div id="wiki-main">{children}</div>

    <footer className="wiki-sitefoot">
      <div className="wiki-sitefoot-inner">
        <div className="wiki-sitefoot-about">
          <p className="wiki-wordmark-static">ATAP Solar Research Wiki</p>
          <p>
            A source-first record of Malaysia&rsquo;s solar programmes. Every figure on this site
            resolves to the fact that carries it and the captured source it came from. Where a
            reviewed page and a raw packet disagree, the reviewed page wins.
          </p>
        </div>
        <div className="wiki-sitefoot-links">
          <div>
            <h2>Corpus</h2>
            <ul>
              <li><Link href="/wiki">Overview</Link></li>
              <li><Link href="/wiki#categories">Categories</Link></li>
              <li><Link href="/research">All packets</Link></li>
            </ul>
          </div>
          <div>
            <h2>Directories</h2>
            <ul>
              <li><Link href="/directory/providers">Providers</Link></li>
              <li><Link href="/directory/sources">Sources</Link></li>
              <li><Link href="/directory/media">Media</Link></li>
              <li><Link href="/directory/records">Dated records</Link></li>
              <li><Link href="/directory/glossary">Glossary</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <p className="wiki-sitefoot-note">
        Research output, presented with its provenance. Not legal, financial or engineering advice.
      </p>
    </footer>
  </div>;
}
