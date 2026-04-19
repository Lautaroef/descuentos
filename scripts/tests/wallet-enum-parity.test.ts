// Cross-cutting parity test — the Zod wallet enum (canonical Promo schema)
// and the UI-side `WALLET_SLUGS` / `WALLET_LABELS` constants MUST agree.
//
// Background (Phase 3.2/3.3): when agents extend the Zod wallet enum they
// frequently forget to update `src/lib/constants.ts`. The UI filter and SEO
// surface would silently drop the new wallet. This test wires the three
// sources together as one atomic contract.
//
// Failure modes this catches:
//   - Zod has a wallet UI doesn't (UI wouldn't render or filter on it).
//   - UI has a wallet Zod doesn't (UI would reference a schema-invalid value).
//   - WALLET_LABELS key set drifts from WALLET_SLUGS (typo / rename).
//
// Kept minimal on purpose — the existing `schema-parity.test.ts` validates the
// canonical values inside the Zod schema; this test only enforces UI alignment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { Promo as PromoSchema } from '../promo-schema.js';
import { WALLET_SLUGS, WALLET_LABELS } from '../../src/lib/constants.js';

function zodWalletOptions(): string[] {
  const arr = PromoSchema.shape.wallet as z.ZodArray<z.ZodEnum<[string, ...string[]]>>;
  return [...arr.element.options];
}

test('wallet-enum-parity: Zod wallet enum == UI WALLET_SLUGS (set equality)', () => {
  const zodSet = new Set(zodWalletOptions());
  const uiSet = new Set<string>(WALLET_SLUGS as readonly string[]);

  const missingInUi = [...zodSet].filter((s) => !uiSet.has(s));
  const missingInZod = [...uiSet].filter((s) => !zodSet.has(s));

  assert.deepStrictEqual(
    missingInUi,
    [],
    `Zod has wallet slug(s) that src/lib/constants.ts WALLET_SLUGS is missing: ${missingInUi.join(', ')}`,
  );
  assert.deepStrictEqual(
    missingInZod,
    [],
    `UI WALLET_SLUGS has entries not in the Zod wallet enum: ${missingInZod.join(', ')}`,
  );
});

test('wallet-enum-parity: WALLET_LABELS keys == WALLET_SLUGS (every slug is labeled)', () => {
  const labelKeys = new Set(Object.keys(WALLET_LABELS));
  const slugSet = new Set<string>(WALLET_SLUGS as readonly string[]);

  const missingLabel = [...slugSet].filter((s) => !labelKeys.has(s));
  const orphanLabel = [...labelKeys].filter((k) => !slugSet.has(k));

  assert.deepStrictEqual(
    missingLabel,
    [],
    `WALLET_LABELS is missing labels for: ${missingLabel.join(', ')}`,
  );
  assert.deepStrictEqual(
    orphanLabel,
    [],
    `WALLET_LABELS has entries without a WALLET_SLUGS counterpart: ${orphanLabel.join(', ')}`,
  );
});

test('wallet-enum-parity: all Phase 3 wallet additions (brubank/naranjax/uala/personalpay + supermarket trio) are present', () => {
  const required = [
    'brubank',
    'naranjax',
    'uala',
    'personalpay',
    'comunidad_coto',
    'jumbo_mas',
    'mi_carrefour',
  ] as const;
  const zodSet = new Set(zodWalletOptions());
  const uiSet = new Set<string>(WALLET_SLUGS as readonly string[]);
  for (const slug of required) {
    assert.ok(zodSet.has(slug), `Zod wallet enum must include ${slug}`);
    assert.ok(uiSet.has(slug), `WALLET_SLUGS must include ${slug}`);
    assert.ok(
      slug in WALLET_LABELS,
      `WALLET_LABELS must have a label for ${slug}`,
    );
  }
});

test('wallet-enum-parity: label values are non-empty strings', () => {
  for (const [slug, label] of Object.entries(WALLET_LABELS)) {
    assert.ok(
      typeof label === 'string' && label.length > 0,
      `WALLET_LABELS[${slug}] must be a non-empty string (got ${JSON.stringify(label)})`,
    );
  }
});
