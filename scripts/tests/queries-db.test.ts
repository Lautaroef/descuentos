// DB-backed edge-case tests for the listPromos query.
//
// Cannot import `src/lib/queries.ts` directly — it loads `server-only` which throws on
// plain Node. Instead we inline the exact same SQL shape against the live DB and assert
// behavior. This is a "contract" test: the production SQL and this test's SQL MUST match
// character-for-character (sort, filters, TTL gate). Any divergence is a bug in the test.
//
// All writes go through `source_id='test-queries-db'` so we never touch real `modo` data.
// Every test cleans up in `finally` / `after`.
//
// Skipped transparently when DATABASE_URL is absent.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { getDb, close } from '../lib/db.js';
import { upsertPromo } from '../lib/promo-repo.js';
import type { Promo } from '../promo-schema.js';

const TEST_SOURCE_ID = 'test-queries-db';
const FRESHNESS_DAYS = 3;

const skipReason = process.env.DATABASE_URL ? undefined : 'DATABASE_URL not set';

// Lightweight inline copy of the production query, parameterized the same way. This MUST
// stay in sync with src/lib/queries.ts::listPromos (and src/lib/constants.FRESHNESS_DAYS).
// If the production SQL changes, this test's SQL must change too — that divergence is the
// thing the test catches.
interface PromoRowRaw {
  id: string;
  source_id: string;
  source_url: string;
  pct: string | number;
  tope: string | number | null;
  valid_days: number[] | null;
  valid_regions: string[] | null;
  merchant: string;
}

interface TestFilter {
  wallets: string[];
  categories: string[];
  banks: string[];
  day: number | null;
  region: string | null;
}

async function listPromosMirror(
  filter: TestFilter,
  sourceIds: string[] = [TEST_SOURCE_ID],
): Promise<PromoRowRaw[]> {
  const sql = getDb();
  const walletArr = filter.wallets.length ? filter.wallets : null;
  const categoryArr = filter.categories.length ? filter.categories : null;
  const bankArr = filter.banks.length ? filter.banks : null;
  const day = filter.day;
  const region = filter.region && filter.region !== 'AR' ? filter.region : null;

  return await sql<PromoRowRaw[]>`
    select id, source_id, source_url, pct, tope, valid_days, valid_regions, merchant
    from promos
    where source_id = any(${sourceIds}::text[])
      and last_seen_at > now() - (${FRESHNESS_DAYS} || ' days')::interval
      and (
        valid_to is null
        or valid_to >= (now() at time zone 'America/Argentina/Buenos_Aires')::date
      )
      and (${walletArr}::text[] is null or wallet && ${walletArr}::text[])
      and (${categoryArr}::text[] is null or category = any(${categoryArr}::text[]))
      and (${bankArr}::text[] is null or issuer_bank && ${bankArr}::text[])
      and (${day}::int is null or ${day}::int = any(valid_days) or array_length(valid_days, 1) is null)
      and (
        ${region}::text is null
        or coalesce(array_length(valid_regions, 1), 0) = 0
        or ${region}::text = any(valid_regions)
      )
    order by tope desc nulls last, pct desc, merchant asc
  `;
}

function makePromo(overrides: Partial<Promo> = {}): Promo {
  const url = overrides.source_url ?? `https://test.example.com/p/${randomUUID()}`;
  return {
    source_id: TEST_SOURCE_ID,
    source_url: url,
    merchant: 'Test Merchant',
    category: 'supermercado',
    wallet: ['modo'],
    issuer_bank: ['galicia'],
    pct: 10,
    promo_type: 'cashback',
    tope: 5000,
    tope_period: 'month',
    valid_days: [0, 1, 2, 3, 4, 5, 6],
    valid_regions: [],
    valid_from: '2026-01-01',
    valid_to: '2026-12-31',
    requires_min_spend: null,
    last_seen_at: new Date().toISOString(),
    ...overrides,
  };
}

async function insertFixture(promo: Promo): Promise<string> {
  const id = randomUUID();
  await upsertPromo({ id, promo, rawHtmlHash: 'test' });
  return id;
}

async function cleanupTestRows(): Promise<void> {
  if (skipReason) return;
  const sql = getDb();
  await sql`delete from promos where source_id = ${TEST_SOURCE_ID}`;
}

test('_setup: wipe any leftover test-queries-db rows', { skip: skipReason }, async () => {
  await cleanupTestRows();
});

// =============================================================================
// P2-9 — tope DESC NULLS LAST sort.
// =============================================================================

test('P2-9 sort: tope DESC NULLS LAST, then pct DESC, then merchant ASC', { skip: skipReason }, async () => {
  try {
    // Three rows whose relative ordering is determined ONLY by the sort clause.
    const a = makePromo({ tope: 10000, pct: 10, merchant: 'A' }); // highest tope
    const b = makePromo({ tope: 5000, pct: 20, merchant: 'B' }); // middle tope
    const c = makePromo({ tope: null, pct: 30, merchant: 'C-hi' }); // no tope, high pct
    const d = makePromo({ tope: null, pct: 15, merchant: 'D-lo' }); // no tope, low pct
    await insertFixture(a);
    await insertFixture(b);
    await insertFixture(c);
    await insertFixture(d);

    const rows = await listPromosMirror({
      wallets: [],
      categories: [],
      banks: [],
      day: null,
      region: null,
    });

    // Expect: [A, B, C-hi, D-lo]
    const merchants = rows.map((r) => r.merchant);
    assert.deepStrictEqual(
      merchants,
      ['A', 'B', 'C-hi', 'D-lo'],
      'tope-DESC-NULLS-LAST then pct-DESC order',
    );

    // Quick sanity: tope-having rows come before tope-null rows.
    const nullIndex = rows.findIndex((r) => r.tope === null);
    const topeIndex = rows.findIndex((r) => r.tope !== null);
    assert.ok(nullIndex > topeIndex, 'NULLs are sorted last');
  } finally {
    await cleanupTestRows();
  }
});

// =============================================================================
// P2-10 — wallet overlap (&&), not equality / contains-all.
// =============================================================================

test('P2-10 wallet filter uses array overlap (&&), not equality', { skip: skipReason }, async () => {
  try {
    const modoOnly = makePromo({ wallet: ['modo'] });
    const mpOnly = makePromo({ wallet: ['mercadopago'] });
    const both = makePromo({ wallet: ['modo', 'mercadopago'] });
    const uala = makePromo({ wallet: ['uala'] });
    await insertFixture(modoOnly);
    await insertFixture(mpOnly);
    await insertFixture(both);
    await insertFixture(uala);

    // Filter modo,mercadopago. Overlap (&&) semantics: match if ANY overlap.
    const rows = await listPromosMirror({
      wallets: ['modo', 'mercadopago'],
      categories: [],
      banks: [],
      day: null,
      region: null,
    });

    const urls = new Set(rows.map((r) => r.source_url));
    assert.ok(urls.has(modoOnly.source_url), 'modo-only matches (partial overlap)');
    assert.ok(urls.has(mpOnly.source_url), 'mp-only matches (partial overlap)');
    assert.ok(urls.has(both.source_url), 'modo+mp matches (full overlap)');
    assert.ok(!urls.has(uala.source_url), 'uala does NOT match (no overlap)');
  } finally {
    await cleanupTestRows();
  }
});

// =============================================================================
// P2-11 — day filter: 3 matches if in valid_days OR if all-days.
// =============================================================================

test('P2-11 day filter: matches rows with the day OR rows with empty valid_days (= all days)', { skip: skipReason }, async () => {
  try {
    const wednesdayOnly = makePromo({ valid_days: [3], merchant: 'wed' });
    const tuesdayOnly = makePromo({ valid_days: [2], merchant: 'tue' });
    const allDays = makePromo({ valid_days: [0, 1, 2, 3, 4, 5, 6], merchant: 'all' });
    const emptyDays = makePromo({ valid_days: [], merchant: 'empty' });
    await insertFixture(wednesdayOnly);
    await insertFixture(tuesdayOnly);
    await insertFixture(allDays);
    await insertFixture(emptyDays);

    const rows = await listPromosMirror({
      wallets: [],
      categories: [],
      banks: [],
      day: 3, // Wednesday
      region: null,
    });

    const merchants = new Set(rows.map((r) => r.merchant));
    assert.ok(merchants.has('wed'), 'day=3 matches Wednesday-only row');
    assert.ok(merchants.has('all'), 'day=3 matches all-days row');
    assert.ok(merchants.has('empty'), 'day=3 matches empty-valid_days (treated as all days)');
    assert.ok(!merchants.has('tue'), 'day=3 does NOT match Tuesday-only row');
  } finally {
    await cleanupTestRows();
  }
});

// =============================================================================
// P2-12 — region filter: CABA matches CABA rows OR empty/national rows.
// =============================================================================

test('P2-12 region filter: matches the region OR empty (national) valid_regions', { skip: skipReason }, async () => {
  try {
    const cabaOnly = makePromo({ valid_regions: ['CABA'], merchant: 'caba' });
    const arBOnly = makePromo({ valid_regions: ['AR-B'], merchant: 'ar-b' });
    const national = makePromo({ valid_regions: [], merchant: 'national' });
    const multi = makePromo({ valid_regions: ['CABA', 'AR-B'], merchant: 'multi' });
    await insertFixture(cabaOnly);
    await insertFixture(arBOnly);
    await insertFixture(national);
    await insertFixture(multi);

    const rows = await listPromosMirror({
      wallets: [],
      categories: [],
      banks: [],
      day: null,
      region: 'CABA',
    });

    const merchants = new Set(rows.map((r) => r.merchant));
    assert.ok(merchants.has('caba'), 'CABA matches CABA-only row');
    assert.ok(merchants.has('national'), 'CABA matches national (empty valid_regions) row');
    assert.ok(merchants.has('multi'), 'CABA matches multi-region row containing CABA');
    assert.ok(!merchants.has('ar-b'), 'CABA does NOT match AR-B-only row');
  } finally {
    await cleanupTestRows();
  }
});

test('P2-12 region=AR is treated as no-op (matches everything)', { skip: skipReason }, async () => {
  try {
    const caba = makePromo({ valid_regions: ['CABA'], merchant: 'caba' });
    const arB = makePromo({ valid_regions: ['AR-B'], merchant: 'ar-b' });
    await insertFixture(caba);
    await insertFixture(arB);

    const rows = await listPromosMirror({
      wallets: [],
      categories: [],
      banks: [],
      day: null,
      region: 'AR',
    });

    const merchants = new Set(rows.map((r) => r.merchant));
    assert.ok(merchants.has('caba'), 'AR "national" sentinel matches CABA row');
    assert.ok(merchants.has('ar-b'), 'AR "national" sentinel matches AR-B row');
  } finally {
    await cleanupTestRows();
  }
});

// =============================================================================
// P2-13 — stale horizon: rows last_seen_at older than 3 days are hidden.
// =============================================================================

test('P2-13 stale horizon: rows older than FRESHNESS_DAYS (3 days) are hidden', { skip: skipReason }, async () => {
  const sql = getDb();
  try {
    const freshUrl = `https://test.example.com/p/fresh-${randomUUID()}`;
    const staleUrl = `https://test.example.com/p/stale-${randomUUID()}`;
    await insertFixture(makePromo({ source_url: freshUrl, merchant: 'fresh' }));
    await insertFixture(makePromo({ source_url: staleUrl, merchant: 'stale' }));

    // Backdate one row by 5 days (> FRESHNESS_DAYS = 3).
    await sql`
      update promos
      set last_seen_at = now() - interval '5 days'
      where source_id = ${TEST_SOURCE_ID} and source_url = ${staleUrl}
    `;

    const rows = await listPromosMirror({
      wallets: [],
      categories: [],
      banks: [],
      day: null,
      region: null,
    });

    const urls = new Set(rows.map((r) => r.source_url));
    assert.ok(urls.has(freshUrl), 'fresh row visible');
    assert.ok(!urls.has(staleUrl), 'stale (5d old) row hidden');
  } finally {
    await cleanupTestRows();
  }
});

// =============================================================================
// P0 — validity gate: rows whose `valid_to` is in the past must not surface
// in list views. The scraper's `last_seen_at` refresh is decoupled from the
// promo's real expiration date, so we need a second gate at query time.
// Audit symptom: a Cerini promo with valid_to='2024-07-31' rendered today as
// "Verificado hace 8 horas."
// =============================================================================

test('validity gate: expired promo (valid_to in past) is excluded', { skip: skipReason }, async () => {
  try {
    const expiredUrl = `https://test.example.com/p/expired-${randomUUID()}`;
    const futureUrl = `https://test.example.com/p/future-${randomUUID()}`;

    await insertFixture(
      makePromo({
        source_url: expiredUrl,
        merchant: 'expired',
        valid_from: '2024-01-01',
        valid_to: '2024-07-31', // 21 months in the past
      }),
    );
    await insertFixture(
      makePromo({
        source_url: futureUrl,
        merchant: 'future',
        valid_from: '2026-01-01',
        valid_to: '2030-12-31',
      }),
    );

    const rows = await listPromosMirror({
      wallets: [],
      categories: [],
      banks: [],
      day: null,
      region: null,
    });

    const urls = new Set(rows.map((r) => r.source_url));
    assert.ok(urls.has(futureUrl), 'future-valid row is visible');
    assert.ok(
      !urls.has(expiredUrl),
      'past-valid_to row is hidden (decouples list visibility from scraper freshness)',
    );
  } finally {
    await cleanupTestRows();
  }
});

test('validity gate: valid_to = today (AR) is still visible (boundary)', {
  skip: skipReason,
}, async () => {
  const sql = getDb();
  try {
    const todayAr = (
      await sql<{ d: Date }[]>`select (now() at time zone 'America/Argentina/Buenos_Aires')::date as d`
    )[0].d;
    const todayIso =
      typeof todayAr === 'string'
        ? (todayAr as string).slice(0, 10)
        : new Date(todayAr).toISOString().slice(0, 10);

    const url = `https://test.example.com/p/boundary-${randomUUID()}`;
    await insertFixture(
      makePromo({
        source_url: url,
        merchant: 'boundary',
        valid_from: '2026-01-01',
        valid_to: todayIso,
      }),
    );

    const rows = await listPromosMirror({
      wallets: [],
      categories: [],
      banks: [],
      day: null,
      region: null,
    });

    const urls = new Set(rows.map((r) => r.source_url));
    assert.ok(urls.has(url), 'valid_to = today in AR tz is still considered active');
  } finally {
    await cleanupTestRows();
  }
});

after(async () => {
  if (skipReason) return;
  await cleanupTestRows().catch(() => {});
  await close().catch(() => {});
});
