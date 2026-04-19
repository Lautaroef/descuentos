// Tests for the Cuenta DNI article discovery ranker.
//
// We don't call the real Firecrawl search API here — we exercise the pure
// `pickArticle()` function with synthetic hit lists. The ranker's job is to
// pick the most-recent month+year whose URL we can reliably scrape, with the
// Ámbito > Infobae > iProUp > iProfesional tie-break in place.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pickArticle } from '../ingestion/cuentadni-discovery.js';

test('pickArticle: returns null when no hit has a parsable month+year', () => {
  const hits = [
    { url: 'https://www.ambito.com/economia/cuenta-dni', title: 'Cuenta DNI beneficios' },
    { url: 'https://www.infobae.com/economia/cuenta-dni', title: 'Cuenta DNI hoy' },
  ];
  assert.strictEqual(pickArticle(hits), null);
});

test('pickArticle: picks the article whose title mentions the most recent month+year', () => {
  const hits = [
    {
      url: 'https://www.ambito.com/economia/como-ahorrar-un-40-semana-cuenta-dni-marzo-n123',
      title: 'Cuenta DNI marzo 2026: cómo ahorrar',
    },
    {
      url: 'https://www.ambito.com/economia/como-ahorrar-un-40-semana-cuenta-dni-abril-n456',
      title: 'Cuenta DNI abril 2026: beneficios renovados',
    },
    {
      url: 'https://www.ambito.com/economia/cuenta-dni-enero-n789',
      title: 'Cuenta DNI enero 2026',
    },
  ];
  // April 2026 is "today" for this test.
  const pick = pickArticle(hits, new Date('2026-04-15T12:00:00Z'));
  assert.ok(pick);
  assert.strictEqual(pick!.month, 4);
  assert.strictEqual(pick!.year, 2026);
  assert.match(pick!.url, /abril/);
});

test('pickArticle: excludes articles from the future month', () => {
  const hits = [
    {
      url: 'https://www.ambito.com/economia/cuenta-dni-mayo-n111',
      title: 'Cuenta DNI mayo 2026: adelanto',
    },
    {
      url: 'https://www.ambito.com/economia/cuenta-dni-abril-n222',
      title: 'Cuenta DNI abril 2026: beneficios',
    },
  ];
  // When "today" is mid-April, an article headlined "mayo 2026" is a future preview.
  const pick = pickArticle(hits, new Date('2026-04-15T12:00:00Z'));
  assert.ok(pick);
  assert.strictEqual(pick!.month, 4, 'April picked, not May preview');
});

test('pickArticle: tie-breaks by outlet priority (Ámbito wins over Infobae when month matches)', () => {
  const hits = [
    {
      url: 'https://www.infobae.com/economia/2026/04/01/cuenta-dni-todos-los-beneficios-de-abril-2026',
      title: 'Cuenta DNI todos los beneficios de abril 2026',
    },
    {
      url: 'https://www.ambito.com/economia/como-ahorrar-un-40-semana-cuenta-dni-abril-n456',
      title: 'Cuenta DNI abril 2026: beneficios renovados',
    },
    {
      url: 'https://www.iproup.com/finanzas/cuenta-dni-abril-2026',
      title: 'Cuenta DNI abril 2026',
    },
  ];
  const pick = pickArticle(hits, new Date('2026-04-15T12:00:00Z'));
  assert.ok(pick);
  assert.strictEqual(pick!.domain, 'ambito.com');
});

test('pickArticle: domains not in priority list land last', () => {
  const hits = [
    {
      url: 'https://somerandomsite.com/cuenta-dni-abril-2026',
      title: 'Cuenta DNI abril 2026',
    },
    {
      url: 'https://www.infobae.com/economia/cuenta-dni-abril-2026',
      title: 'Cuenta DNI abril 2026',
    },
  ];
  const pick = pickArticle(hits, new Date('2026-04-15T12:00:00Z'));
  assert.ok(pick);
  assert.strictEqual(pick!.domain, 'infobae.com');
});

test('pickArticle: picks most recent when everything is in the past', () => {
  const hits = [
    {
      url: 'https://www.ambito.com/economia/cuenta-dni-enero-n1',
      title: 'Cuenta DNI enero 2026',
    },
    {
      url: 'https://www.ambito.com/economia/cuenta-dni-marzo-n3',
      title: 'Cuenta DNI marzo 2026',
    },
    {
      url: 'https://www.ambito.com/economia/cuenta-dni-febrero-n2',
      title: 'Cuenta DNI febrero 2026',
    },
  ];
  // "Today" is mid-April; nothing in the list is current, but marzo is the most recent.
  const pick = pickArticle(hits, new Date('2026-04-15T12:00:00Z'));
  assert.ok(pick);
  assert.strictEqual(pick!.month, 3);
});
