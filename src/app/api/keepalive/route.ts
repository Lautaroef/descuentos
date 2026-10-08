// Daily DB keep-alive, triggered by Vercel Cron (see vercel.json).
//
// Why: Supabase pauses Free-plan projects that show low database activity over
// 7 days (docs: supabase.com/docs/guides/platform/free-project-pausing). A paused
// project makes every page that reads Postgres return 500. On 2026-10-08 that took
// the home page down because the Inngest schedules (which used to generate the
// traffic) had stopped running. This route is a deploy-native heartbeat that
// does not depend on any third-party scheduler: Vercel Cron (Hobby allows one run
// per day) calls it, and it runs a real read against `promos`, which counts as
// user database activity.
//
// Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` on cron invocations.
// Requests without the matching secret get 401 so the endpoint can't be used to
// hammer the DB.
import { getDb } from '@/lib/db';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const sql = getDb();
    const rows = await sql<{ total: number }[]>`select count(*)::int as total from promos`;
    return Response.json({ ok: true, promos: rows[0]?.total ?? 0, at: new Date().toISOString() });
  } catch (err) {
    // Surface as 503 so the failure is visible in Vercel cron + runtime logs.
    console.error('[keepalive] database ping failed', err);
    return Response.json({ ok: false, error: 'database unreachable' }, { status: 503 });
  }
}
