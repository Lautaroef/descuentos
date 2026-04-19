// Hub parser robustness tests.
//
// The hub crawler feeds everything downstream: if it emits garbage slugs, every Gemini
// call downstream wastes credits on 404s. Specific failure modes to guard against:
//   - Anchor fragments (#main-content, #share) masquerading as slugs.
//   - Category/slot routes (/promos/slot/web-modo-hub-supermercado) leaking through.
//   - Upper-case slugs producing dupes of the same content.
//   - Trailing punctuation and query strings mangling the slug.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractSlugsForTests } from '../ingestion/modo-hub.js';

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
