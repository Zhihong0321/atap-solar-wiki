import { one, rows } from './db.mjs';

/** Returns every fail-closed publication error; an empty list means eligible. */
export async function validateArticlePublication(reference) {
  const article = typeof reference === 'number'
    ? await one('SELECT id,slug,lang,status FROM articles WHERE id=$1', [reference])
    : await one('SELECT id,slug,lang,status FROM articles WHERE slug=$1', [String(reference)]);
  if (!article) return { article: null, eligible: false, failures: [{ code: 'article_not_found', detail: 'Article does not exist' }] };
  const failures = await rows('SELECT code,detail FROM article_publication_failures($1)', [article.id]);
  return { article, eligible: failures.length === 0, failures };
}

