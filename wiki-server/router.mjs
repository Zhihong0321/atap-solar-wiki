/**
 * Read-only JSON API behind /api/wiki/*. Mirrors the routes the research
 * server exposed to the wiki, minus everything that wrote or ran research.
 * Returns `{ status, body }` so the Next route handler stays a thin adapter.
 */
import { getArticlePage } from './article.mjs';
import {
  directoryTotals,
  listGlossary,
  listMedia,
  listProviders,
  listSources,
  listTimeline,
} from './directory.mjs';
import { getClaimEvidence } from './evidence.mjs';
import { getIssueDecision } from './issues.mjs';
import { getDomain, getPacket, listDomains, listPackets } from './packet.mjs';

const ok = (body) => ({ status: 200, body });
const notFound = (error) => ({ status: 404, body: { error } });

const lists = {
  providers: listProviders,
  sources: listSources,
  glossary: listGlossary,
  timeline: listTimeline,
  media: listMedia,
};

export async function handleWikiApi(segments, searchParams) {
  const options = Object.fromEntries(searchParams.entries());
  const [head, id, tail] = segments;

  if (segments.length === 1) {
    if (head === 'domains') return ok(await listDomains());
    if (head === 'packets') return ok(await listPackets());
    if (head === 'totals') return ok(await directoryTotals());
    if (lists[head]) return ok(await lists[head](options));
  }

  if (segments.length === 2) {
    if (head === 'domains') {
      const detail = await getDomain(id);
      return detail ? ok(detail) : notFound('Research category not found.');
    }
    if (head === 'packets') {
      const detail = await getPacket(id);
      return detail ? ok(detail) : notFound('Research packet not found.');
    }
    if (head === 'articles') {
      const page = await getArticlePage(id);
      return page ? ok(page) : notFound('Published article not found.');
    }
    if (head === 'issues') {
      const issue = await getIssueDecision(id);
      return issue ? ok(issue) : notFound('Reviewed issue not found.');
    }
  }

  if (segments.length === 3 && head === 'claim-variants' && tail === 'evidence') {
    const evidence = await getClaimEvidence(id);
    return evidence ? ok(evidence) : notFound('Canonical claim variant not found.');
  }

  return notFound('Endpoint not found.');
}
