// Data-integrity tests for the ingestion DB surface.
//
// All writes go through `source_id='test-upsert'` so we never touch real `modo` rows.
// Every test cleans up in a `finally` or `afterEach`-equivalent so re-running doesn't
// leave drift. DATABASE_URL is required; the suite skips if it's absent.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import {
  listPromoSlugsForSource,
  markPromoSeen,
  softPurgeStalePromos,
  upsertPromo,
} from '../lib/promo-repo.js';
import { getDb, close } from '../lib/db.js';
import type { Promo } from '../promo-schema.js';
import { hashMarkdown } from '../lib/modo-extract.js';

const TEST_SOURCE_ID = 'test-upsert';

const skipReason = process.env.DATABASE_URL ? undefined : 'DATABASE_URL not set';

function makeTestPromo(overrides: Partial<Promo> = {}): Promo {
  const url =
    overrides.source_url ?? `https://test.example.com/promos/${randomUUID()}`;
  return {
    source_id: TEST_SOURCE_ID,
    source_url: url,
    merchant: 'Test Merchant',
    category: 'supermercado',
    wallet: ['modo'],
    issuer_bank: ['galicia'],
    pct: 15,
    promo_type: 'cashback',
    tope: 5000,
    tope_period: 'month',
    valid_days: [2, 3],
    valid_regions: [],
    valid_from: '2026-01-01',
    valid_to: '2026-12-31',
    requires_min_spend: null,
    last_seen_at: new Date().toISOString(),
    ...overrides,
  };
}

async function cleanupTestRows(): Promise<void> {
  if (skipReason) return;
  const sql = getDb();
  await sql`delete from promos where source_id = ${TEST_SOURCE_ID}`;
}

// Ensure a clean slate at the start of the suite and after it.
test('_setup: wipe any leftover test-upsert rows', { skip: skipReason }, async () => {
  await cleanupTestRows();
  const remaining = await listPromoSlugsForSource(TEST_SOURCE_ID);
  assert.equal(remaining.length, 0);
});

// =============================================================================
// P1-5 — Upsert-with-TTL behavior.
// =============================================================================

test('P1-5 insert path: new row writes last_seen_at and returns "inserted"', { skip: skipReason }, async () => {
  const id = randomUUID();
  const promo = makeTestPromo();
  try {
    const t0 = Date.now();
    const action = await upsertPromo({
      id,
      promo,
      rawHtmlHash: hashMarkdown('initial content v1'),
    });
    assert.strictEqual(action, 'inserted');

    const rows = await listPromoSlugsForSource(TEST_SOURCE_ID);
    const row = rows.find((r) => r.source_url === promo.source_url);
    assert.ok(row, 'row persisted');
    const lastSeenMs = new Date(row!.last_seen_at).getTime();
    assert.ok(Math.abs(lastSeenMs - t0) < 60_000, 'last_seen_at is approximately now');
  } finally {
    await cleanupTestRows();
  }
});

test('P1-5 update path: second upsert on same (source_id, source_url) returns "updated"', { skip: skipReason }, async () => {
  const id = randomUUID();
  const promo = makeTestPromo();
  try {
    await upsertPromo({ id, promo, rawHtmlHash: hashMarkdown('initial') });
    const action = await upsertPromo({
      id,
      promo: { ...promo, pct: 20 },
      rawHtmlHash: hashMarkdown('updated'),
    });
    assert.strictEqual(action, 'updated');
  } finally {
    await cleanupTestRows();
  }
});

test('P1-5 update preserves created_at and advances last_seen_at', { skip: skipReason }, async () => {
  const sql = getDb();
  const id = randomUUID();
  const promo = makeTestPromo();
  try {
    // First insert.
    await upsertPromo({ id, promo, rawHtmlHash: hashMarkdown('v1') });
    const [first] = await sql<{ created_at: string; last_seen_at: string }[]>`
      select created_at, last_seen_at
      from promos
      where source_id = ${promo.source_id} and source_url = ${promo.source_url}
    `;
    const createdAtFirst = new Date(first.created_at).getTime();
    const lastSeenFirst = new Date(first.last_seen_at).getTime();

    // Wait briefly so timestamps can differ by clock resolution.
    await new Promise((r) => setTimeout(r, 25));

    // Second upsert.
    await upsertPromo({
      id,
      promo: { ...promo, pct: 30 },
      rawHtmlHash: hashMarkdown('v2'),
    });
    const [second] = await sql<{ created_at: string; last_seen_at: string }[]>`
      select created_at, last_seen_at
      from promos
      where source_id = ${promo.source_id} and source_url = ${promo.source_url}
    `;
    const createdAtSecond = new Date(second.created_at).getTime();
    const lastSeenSecond = new Date(second.last_seen_at).getTime();

    assert.strictEqual(
      createdAtFirst,
      createdAtSecond,
      'created_at preserved across upserts',
    );
    assert.ok(
      lastSeenSecond >= lastSeenFirst,
      `last_seen_at monotonic (was ${lastSeenFirst}, now ${lastSeenSecond})`,
    );
  } finally {
    await cleanupTestRows();
  }
});

test('P1-5 (source_id, source_url) uniqueness: two upserts = one row', { skip: skipReason }, async () => {
  const sql = getDb();
  const id = randomUUID();
  const promo = makeTestPromo();
  try {
    await upsertPromo({ id, promo, rawHtmlHash: hashMarkdown('v1') });
    // Even with a different `id`, the ON CONFLICT (source_id, source_url) path keeps the
    // same row — the existing id is preserved on update.
    await upsertPromo({
      id: randomUUID(),
      promo: { ...promo, pct: 25 },
      rawHtmlHash: hashMarkdown('v2'),
    });
    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count
      from promos
      where source_id = ${promo.source_id} and source_url = ${promo.source_url}
    `;
    assert.strictEqual(rows[0].count, 1, 'unique-key constraint collapses to one row');
  } finally {
    await cleanupTestRows();
  }
});

// =============================================================================
// P1-6 — Change-detection skip path.
//
// The production ingestion flow (scripts/ingestion/modo-detail.ts) loads the cached
// hash via `listPromoSlugsForSource`, compares to the freshly scraped markdown's
// `hashMarkdown`, and either calls `markPromoSeen` (unchanged) or `upsertPromo` (changed).
// We test the two branches on top of the DB primitives directly — no LLM call involved.
// =============================================================================

test('P1-6 markPromoSeen bumps last_seen_at without touching other columns', { skip: skipReason }, async () => {
  const sql = getDb();
  const id = randomUUID();
  const promo = makeTestPromo({ pct: 17 });
  try {
    await upsertPromo({ id, promo, rawHtmlHash: hashMarkdown('same') });
    const [before] = await sql<{
      pct: number | string;
      last_seen_at: string;
      updated_at: string;
    }[]>`
      select pct, last_seen_at, updated_at
      from promos
      where source_id = ${promo.source_id} and source_url = ${promo.source_url}
    `;

    await new Promise((r) => setTimeout(r, 25));
    await markPromoSeen(TEST_SOURCE_ID, promo.source_url);

    const [after] = await sql<{
      pct: number | string;
      last_seen_at: string;
      updated_at: string;
    }[]>`
      select pct, last_seen_at, updated_at
      from promos
      where source_id = ${promo.source_id} and source_url = ${promo.source_url}
    `;

    // pct didn't move (the "content unchanged" contract).
    assert.strictEqual(String(after.pct), String(before.pct));
    // last_seen_at advanced.
    assert.ok(
      new Date(after.last_seen_at).getTime() > new Date(before.last_seen_at).getTime(),
      'last_seen_at advanced',
    );
    // updated_at is unchanged (this is the distinguishing signal per migration 003's comment).
    // postgres-js returns timestamps as Date objects, so compare by numeric ms.
    assert.strictEqual(
      new Date(after.updated_at).getTime(),
      new Date(before.updated_at).getTime(),
      'updated_at NOT bumped by markPromoSeen (it is the "re-extracted" signal)',
    );
  } finally {
    await cleanupTestRows();
  }
});

test('P1-6 hash comparison detects unchanged vs changed content', { skip: skipReason }, async () => {
  // Mirrors the decision the ingestion adapter makes:
  //   if existing.raw_html_hash === hashMarkdown(md) → markPromoSeen()  (skip LLM)
  //   else                                           → upsertPromo()   (run LLM)
  // This test verifies the hash is what the adapter reads and that the semantics of
  // the loaded PersistedPromoMeta match what the adapter expects.
  const id = randomUUID();
  const promo = makeTestPromo();
  const md1 = '# Promo\nSome content version 1.';
  const md2 = '# Promo\nSome content version 2 — different!';
  try {
    await upsertPromo({ id, promo, rawHtmlHash: hashMarkdown(md1) });

    // Reload the metadata exactly as the adapter does.
    const rows = await listPromoSlugsForSource(TEST_SOURCE_ID);
    const existing = rows.find((r) => r.source_url === promo.source_url);
    assert.ok(existing, 'row present');

    // Same content → hash matches → adapter would call markPromoSeen.
    assert.strictEqual(existing!.raw_html_hash, hashMarkdown(md1), 'hash matches for same content');
    // Different content → hash diverges → adapter would invoke LLM + upsert.
    assert.notStrictEqual(
      existing!.raw_html_hash,
      hashMarkdown(md2),
      'hash differs for new content',
    );
  } finally {
    await cleanupTestRows();
  }
});

// =============================================================================
// P1-7 — softPurgeStalePromos surface check.
//
// The function doesn't delete — it just reports which rows are past the TTL horizon.
// We seed two rows under TEST_SOURCE_ID: one with last_seen_at 5 days old, one with
// today. Call softPurgeStalePromos('test-upsert', 3) and assert it returns only the
// stale one.
//
// NOTE: softPurgeStalePromos signature is (source_id, horizon_days = 3). The task
// description mentioned (source_id, now, horizon_days) — the actual implementation
// uses `now()` from Postgres, so we can't pass a custom clock. We work around it by
// backdating the last_seen_at column directly after the insert.
// =============================================================================

test('P1-7 softPurgeStalePromos returns rows older than horizon; hides fresh ones', { skip: skipReason }, async () => {
  const sql = getDb();
  const staleUrl = `https://test.example.com/promos/stale-${randomUUID()}`;
  const freshUrl = `https://test.example.com/promos/fresh-${randomUUID()}`;
  try {
    await upsertPromo({
      id: randomUUID(),
      promo: makeTestPromo({ source_url: staleUrl }),
      rawHtmlHash: 'stale-hash',
    });
    await upsertPromo({
      id: randomUUID(),
      promo: makeTestPromo({ source_url: freshUrl }),
      rawHtmlHash: 'fresh-hash',
    });

    // Backdate the stale row by 5 days.
    await sql`
      update promos
      set last_seen_at = now() - interval '5 days'
      where source_id = ${TEST_SOURCE_ID} and source_url = ${staleUrl}
    `;

    const stale = await softPurgeStalePromos(TEST_SOURCE_ID, 3);
    const staleUrls = new Set(stale.map((r) => r.source_url));

    assert.ok(staleUrls.has(staleUrl), 'stale row surfaced');
    assert.ok(!staleUrls.has(freshUrl), 'fresh row NOT surfaced');

    // Surface check: function must NOT actually delete anything.
    const [count] = await sql<{ count: number }[]>`
      select count(*)::int as count
      from promos
      where source_id = ${TEST_SOURCE_ID} and source_url in (${staleUrl}, ${freshUrl})
    `;
    assert.strictEqual(count.count, 2, 'soft purge did not delete');
  } finally {
    await cleanupTestRows();
  }
});

test('P1-7 softPurgeStalePromos with very large horizon returns nothing', { skip: skipReason }, async () => {
  const id = randomUUID();
  const promo = makeTestPromo();
  try {
    await upsertPromo({ id, promo, rawHtmlHash: 'x' });
    const stale = await softPurgeStalePromos(TEST_SOURCE_ID, 365);
    // Freshly-inserted row can't be 365 days old.
    assert.ok(
      !stale.some((r) => r.source_url === promo.source_url),
      'fresh row NOT reported as stale',
    );
  } finally {
    await cleanupTestRows();
  }
});

// Teardown: close pool once all tests are done.
after(async () => {
  if (skipReason) return;
  await cleanupTestRows().catch(() => {});
  await close().catch(() => {});
});
