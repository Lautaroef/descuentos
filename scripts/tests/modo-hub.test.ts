// Hub parser robustness tests + resilience tests for the 2026-04-23 silent-0 failure mode.
//
// The hub crawler feeds everything downstream: if it emits garbage slugs, every Gemini
// call downstream wastes credits on 404s. Specific failure modes to guard against:
//   - Anchor fragments (#main-content, #share) masquerading as slugs.
//   - Category/slot routes (/promos/slot/web-modo-hub-supermercado) leaking through.
//   - Upper-case slugs producing dupes of the same content.
//   - Trailing punctuation and query strings mangling the slug.
//   - Firecrawl returning a stale 48-char SPA shell from cache (silent-0 regression).
//   - Firecrawl rendering a partial DOM that only yields a handful of slugs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractSlugsForTests, fetchModoHubSlugs } from '../ingestion/modo-hub.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = resolve(__dirname, '..', 'samples', 'modo-stress');

test('P3-16 dedupes repeated slug links', () => {
  const md = `
## Supermercados

[COTO](https://www.modo.com.ar/promos/coto-mar26)
[COTO again](https://www.modo.com.ar/promos/coto-mar26)
[COTO once more, different anchor](https://www.modo.com.ar/promos/coto-mar26#details)
  `;
  const slugs = extractSlugsForTests(md);
  assert.deepStrictEqual(slugs, ['coto-mar26'], 'one slug, not three');
});

test('P3-16 lowercases upper-case slug matches so they dedupe against lowercase', () => {
  const md = `
[COTO](https://www.modo.com.ar/promos/COTO-MAR26)
[coto](https://www.modo.com.ar/promos/coto-mar26)
  `;
  const slugs = extractSlugsForTests(md);
  assert.deepStrictEqual(slugs, ['coto-mar26']);
});

test('P3-16 skips /promos/slot/* category routes', () => {
  const md = `
[Supermercados](https://www.modo.com.ar/promos/slot/web-modo-hub-supermercados)
[Farmacias](https://www.modo.com.ar/promos/slot/web-modo-hub-farmacias)
[COTO](https://www.modo.com.ar/promos/coto-mar26)
  `;
  const slugs = extractSlugsForTests(md);
  assert.deepStrictEqual(slugs, ['coto-mar26'], 'slot routes filtered out');
});

test('P3-16 skips the root /promos anchor', () => {
  const md = `
[All promos](https://www.modo.com.ar/promos)
[Skip to main](https://www.modo.com.ar/promos/main-content)
[COTO](https://www.modo.com.ar/promos/coto-mar26)
  `;
  const slugs = extractSlugsForTests(md);
  assert.deepStrictEqual(slugs, ['coto-mar26']);
});

test('P3-16 tolerates query strings and hash fragments on the slug URL', () => {
  const md = `
[COTO](https://www.modo.com.ar/promos/coto-mar26?utm_source=email)
[Openfarma](https://www.modo.com.ar/promos/openfarma-abril26#main-content)
  `;
  const slugs = extractSlugsForTests(md);
  assert.deepStrictEqual(slugs.sort(), ['coto-mar26', 'openfarma-abril26']);
});

test('P3-16 returns an empty list when the markdown has no /promos/<slug> links', () => {
  const md = `
# Welcome

Just some text, a [blog link](https://www.modo.com.ar/blog/article), and an unrelated
[link](https://www.example.com/something).

No promo URLs at all.
  `;
  assert.deepStrictEqual(extractSlugsForTests(md), []);
});

test('P3-16 output is sorted for deterministic downstream diffing', () => {
  const md = `
[Zebra](https://www.modo.com.ar/promos/zebra-mar26)
[Alpha](https://www.modo.com.ar/promos/alpha-mar26)
[Mike](https://www.modo.com.ar/promos/mike-mar26)
  `;
  const slugs = extractSlugsForTests(md);
  assert.deepStrictEqual(slugs, ['alpha-mar26', 'mike-mar26', 'zebra-mar26']);
});

// ---------------------------------------------------------------------------
// Silent-0 failure-mode regressions (2026-04-23).
//
// The bug: Firecrawl returned a 48-char SPA-title-only response (cached from an
// earlier hydration glitch), fetchModoHubSlugs returned 0 slugs, and the run
// silently reported "0 slugs / 0 inserts" — marking 40 real promos as stale
// via the TTL path. New contract:
//   1. A short body must trigger an escalated retry (maxAge:0 + waitFor:15000).
//   2. If the escalation ALSO returns short, fetchModoHubSlugs must THROW.
//   3. Any result with < 10 slugs must THROW (historical baseline is 40-57).
//
// Tests use the scrapeOverride hook to stub Firecrawl deterministically.
// ---------------------------------------------------------------------------

/** Build a healthy hub markdown with N slugs — matches the real hub's link shape. */
function makeHealthyHubMarkdown(slugCount: number): string {
  const header = `Promociones \\| MODO - La Billetera de los Bancos\n\n# Decile adentro a todas esas promos que querés\n\n## destacadas\n\n`;
  const links: string[] = [];
  for (let i = 0; i < slugCount; i++) {
    const slug = `test-promo-${i.toString().padStart(3, '0')}-abril26`;
    links.push(`[![](https://cdn/img${i}.jpg)](https://www.modo.com.ar/promos/${slug})`);
  }
  // Pad the body with filler so we clear the 500-char MIN_MARKDOWN_CHARS floor
  // even when slugCount is deliberately small.
  const filler = 'lorem ipsum dolor sit amet '.repeat(30);
  return header + links.join('\n\n') + '\n\n' + filler;
}

test('[resilience] escalates when fast path returns a near-empty body', async () => {
  // Simulates the 2026-04-23 bug: cached 48-char SPA shell on first call, healthy on retry.
  const cachedShell = 'Promociones \\| MODO - La Billetera de los Bancos';
  assert.ok(cachedShell.length < 500, 'test setup: shell must be under threshold');
  const healthy = makeHealthyHubMarkdown(40);
  const calls: Array<{ url: string; maxAge: number | undefined; waitFor: number | undefined }> = [];

  const result = await fetchModoHubSlugs({
    scrapeOverride: async (url, options) => {
      calls.push({ url, maxAge: options.maxAge, waitFor: options.waitFor });
      if (calls.length === 1) {
        return { markdown: cachedShell, creditsUsed: 1 };
      }
      return { markdown: healthy, creditsUsed: 1 };
    },
  });

  assert.strictEqual(calls.length, 2, 'escalation must fire exactly once');
  assert.strictEqual(calls[0].maxAge, 3_600_000, 'fast path uses 1h cache');
  assert.strictEqual(calls[0].waitFor, 5000, 'fast path waits 5s');
  assert.strictEqual(calls[1].maxAge, 0, 'escalation bypasses cache');
  assert.strictEqual(calls[1].waitFor, 15000, 'escalation waits 15s');
  assert.strictEqual(result.attempt, 2, 'result.attempt records escalation');
  assert.strictEqual(result.slugs.length, 40, 'escalated result has all slugs');
  assert.strictEqual(result.credits_used, 2, 'credits_used sums both attempts');
});

test('[resilience] skips escalation when fast path succeeds', async () => {
  const healthy = makeHealthyHubMarkdown(40);
  let callCount = 0;

  const result = await fetchModoHubSlugs({
    scrapeOverride: async () => {
      callCount += 1;
      return { markdown: healthy, creditsUsed: 1 };
    },
  });

  assert.strictEqual(callCount, 1, 'only fast path should fire on healthy first call');
  assert.strictEqual(result.attempt, 1);
  assert.strictEqual(result.slugs.length, 40);
});

test('[resilience] throws when both fast path and escalation return near-empty', async () => {
  // The 48-char SPA shell AFTER escalation means MODO itself is broken or Firecrawl
  // cannot render it. Silent-0 is the class of bug we are eliminating — must throw.
  const shell = 'Promociones \\| MODO - La Billetera de los Bancos';

  await assert.rejects(
    () =>
      fetchModoHubSlugs({
        scrapeOverride: async () => ({ markdown: shell, creditsUsed: 1 }),
      }),
    /MODO hub scrape failed both attempts/,
    'must surface a descriptive error instead of returning 0 slugs',
  );
});

test('[resilience] throws when body is long but yields too few slugs', async () => {
  // DOM-change simulation: body renders but the slug regex only finds 5 matches
  // (historical baseline is 40-57). Silently proceeding would mark ~35 real promos
  // stale via the TTL path. Must throw.
  const header = `Promociones \\| MODO\n\n# Decile adentro\n\n`;
  const links: string[] = [];
  for (let i = 0; i < 5; i++) {
    links.push(`[slug ${i}](https://www.modo.com.ar/promos/only-${i}-abril26)`);
  }
  const filler = 'x'.repeat(2000); // Clear the length floor so we hit the slug-count floor.
  const md = header + links.join('\n\n') + '\n\n' + filler;
  assert.ok(md.length > 500, 'test setup: must clear length floor');

  await assert.rejects(
    () =>
      fetchModoHubSlugs({
        scrapeOverride: async () => ({ markdown: md, creditsUsed: 1 }),
      }),
    /sanity check failed: extracted 5 slugs/,
    'hub must reject slug counts below the historical baseline',
  );
});

test('[resilience] slug-extraction regression against a realistic hub fixture', async () => {
  // Synthesizes a hub markdown shaped like the real April 2026 hub (section headers +
  // card links) and asserts the slug regex picks up a known-good subset. Guards against
  // regex drift if we ever need to rework extractSlugs.
  const fixture = [
    '# Decile adentro a todas esas promos que querés',
    '## destacadas',
    '[![](cdn/1.jpg)](https://www.modo.com.ar/promos/supermiercoles-santander-info-mar26-jun26)',
    '[![](cdn/2.jpg)](https://www.modo.com.ar/promos/coto-mar26)',
    '[![](cdn/3.jpg)](https://www.modo.com.ar/promos/jumbo-mar26)',
    '## supermercados',
    '[![](cdn/4.jpg)](https://www.modo.com.ar/promos/carrefour-mar26)',
    '[![](cdn/5.jpg)](https://www.modo.com.ar/promos/discovea-mar26)',
    '[Slot link](https://www.modo.com.ar/promos/slot/web-modo-hub-supermercados)',
    '## farmacias',
    '[![](cdn/6.jpg)](https://www.modo.com.ar/promos/openfarma-abril26)',
    '[![](cdn/7.jpg)](https://www.modo.com.ar/promos/farmacia-acosta-abril26)',
    '[![](cdn/8.jpg)](https://www.modo.com.ar/promos/paradineiro-online-feb26)',
    '[Skip anchor](https://www.modo.com.ar/promos#main-content)',
    '## financiación',
    '[![](cdn/9.jpg)](https://www.modo.com.ar/promos/12-icbc-icbcmall-mar26)',
    '[![](cdn/10.jpg)](https://www.modo.com.ar/promos/3csi-farmacias-bna-mar24)',
    '[![](cdn/11.jpg)](https://www.modo.com.ar/promos/10off-3csi-opticas-bna-mar25)',
    '[![](cdn/12.jpg)](https://www.modo.com.ar/promos/24csi-on-city-bancodelsol-landing-abr26)',
  ].join('\n\n');

  const result = await fetchModoHubSlugs({
    scrapeOverride: async () => ({ markdown: fixture, creditsUsed: 1 }),
  });

  // Slot route must be filtered out; main-content anchor must be filtered out.
  assert.ok(!result.slugs.includes('slot'), 'slot route must be rejected');
  assert.ok(!result.slugs.includes('main-content'), 'anchor must be rejected');
  // Spot-check a mix of known-good slug shapes.
  const expectedSubset = [
    'coto-mar26',
    'jumbo-mar26',
    'carrefour-mar26',
    'supermiercoles-santander-info-mar26-jun26',
    '10off-3csi-opticas-bna-mar25',
    '3csi-farmacias-bna-mar24',
    '24csi-on-city-bancodelsol-landing-abr26',
  ];
  for (const slug of expectedSubset) {
    assert.ok(
      result.slugs.includes(slug),
      `regex regression: ${slug} missing from ${JSON.stringify(result.slugs)}`,
    );
  }
});

test('[resilience] slug-extraction regression against a real stress-test detail fixture', async () => {
  // The stress-test detail markdown contains many internal /promos/<slug> references in
  // "also see" blocks. Using it as a reverse fixture: if our regex walks over realistic
  // MODO markdown, it should pick up slugs without false positives on the page's own
  // assets (CDN hrefs, anchors).
  const md = await readFile(resolve(SAMPLES_DIR, 'raw', 'coto-mar26.md'), 'utf8');
  const slugs = extractSlugsForTests(md);
  // The stress-test detail markdown may or may not mention many slugs — we only assert
  // shape invariants, not an exact count. Every match must be a valid slug-shaped string.
  for (const slug of slugs) {
    assert.match(slug, /^[a-z0-9][a-z0-9-]+$/, `invalid slug shape: ${slug}`);
    assert.notStrictEqual(slug, 'slot');
    assert.notStrictEqual(slug, 'main-content');
    assert.notStrictEqual(slug, 'promos');
  }
});
