// Regression guard for the 2026-10-08 outage: Supabase paused the project for
// inactivity and the home page returned 500. The keep-alive route must (a) only
// run for Vercel Cron, (b) actually read the database, (c) report failures as 503.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('@/lib/db', () => ({ getDb: () => query }));

import { GET } from './route';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';

function req(auth?: string): Request {
  return new Request('https://example.test/api/keepalive', {
    headers: auth ? { authorization: auth } : {},
  });
}

describe('isAuthorizedCronRequest', () => {
  it('fails closed when no secret is configured', () => {
    expect(isAuthorizedCronRequest('Bearer ', undefined)).toBe(false);
    expect(isAuthorizedCronRequest(null, '')).toBe(false);
  });
  it('accepts only the exact bearer token', () => {
    expect(isAuthorizedCronRequest('Bearer s3cret', 's3cret')).toBe(true);
    expect(isAuthorizedCronRequest('Bearer wrong', 's3cret')).toBe(false);
    expect(isAuthorizedCronRequest('s3cret', 's3cret')).toBe(false);
  });
});

describe('GET /api/keepalive', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    query.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects unauthenticated callers without touching the DB', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('reads the promos table and returns the count', async () => {
    query.mockResolvedValue([{ total: 42 }]);
    const res = await GET(req('Bearer s3cret'));
    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, promos: 42 });
  });

  it('returns 503 when the database is unreachable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    query.mockRejectedValue(new Error('tenant/user not found'));
    const res = await GET(req('Bearer s3cret'));
    expect(res.status).toBe(503);
  });
});
