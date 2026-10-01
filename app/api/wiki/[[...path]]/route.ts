import { handleWikiApi } from '../../../../wiki-server/router.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  try {
    const { status, body } = await handleWikiApi(path.map(decodeURIComponent), new URL(request.url).searchParams);
    return Response.json(body, { status, headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=600' } });
  } catch (error) {
    console.error('[wiki-api]', error);
    return Response.json({ error: 'The wiki database is unavailable.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
