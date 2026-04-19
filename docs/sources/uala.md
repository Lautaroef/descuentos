# Ualá — Source Guide

Phase 3.2 wallet source. Shipped 2026-04-19.

## What this source covers

- **Wallet**: Ualá (prepaid card + fintech wallet, Argentina).
- **URLs**: hub `https://www.uala.com.ar/promociones` + per-merchant detail `/promociones/<slug>`.
- **Merchants**: thin catalog — April 2026 hub shows 4 merchant slugs (Carrefour, Coderhouse, Sportclub, Ualá Bis). Expected to grow.
- **Data shape**: per-merchant detail pages use **MODO-grade fixed-label blocks** — `Días: L M M J V S D`, `Métodos de pago:`, `Tipo de comercio:`, `Válido hasta:`, `Tope de reintegro:`, `Tiempo de acreditación:`, `Disponible en:`, plus full legal T&Cs.
- **Region scope**: national by default (`valid_regions: []`). CABA/Buenos Aires overrides labeled per merchant.

## Endpoints scraped

| URL | `kind` | Refresh | Credits |
|---|---|---|---|
| `https://www.uala.com.ar/promociones` (hub, enumerates slugs) | — | Weekly | 1 Firecrawl / run |
| `https://www.uala.com.ar/promociones/<slug>` (detail, one per slug) | `per-url` | Weekly | 1 Firecrawl / slug |

Ualá is a `per-url` source (like MODO): one slug → one Promo. Hash-compare skip fires on re-scrape when the detail markdown is unchanged — confirmed on the live smoke (0 inserts / 0 updates / 4 unchanged on the second run).

## Canonical id strategy

```
id = uuidV5(`https://www.uala.com.ar/promociones/${slug}`, UALA_NAMESPACE)
```

Single-tuple per slug — matches MODO's approach. Stable across re-runs; monthly refresh UPSERTs the same row.

## Fixtures saved

- `scripts/samples/long-tail/wallets/uala/promociones-hub.md` — hub markdown (4 slugs).
- `scripts/samples/long-tail/wallets/uala/promociones-carrefour.md` — Carrefour detail page (the goldmine — shows the fixed-label blocks + full legal T&Cs).
- `scripts/samples/long-tail/wallets/uala/promociones-carrefour.extract.json` — known-good LLM payload for Carrefour (sábados sin tope).

## Edge cases discovered

- **`Días: L M M J V S D` icon row loses active-state in markdown** — same problem as MODO. **The prompt explicitly tells the LLM NOT to default to all 7 days** and to parse the legal text ("los días sábados 4, 11, 18 y 25 de marzo") instead. On the Carrefour fixture this yielded `valid_days=[6]` correctly. On merchants with no legal-text weekday phrase, the LLM falls back to all 7 with a warning (via `valid_days_reasoning`).
- **"Válido hasta: Hasta el 30 de abril 2026"** — Spanish date format. The prompt parses to `2026-04-30`.
- **"Tope de reintegro: Sin tope"** → `tope=null`, `tope_period=null`. Observed on Carrefour (the 10% QR promo is explicitly sin tope).
- **"Disponible en: Todo el país"** → `valid_regions: []`. If the merchant is Buenos-Aires-only, it would read "Buenos Aires" → `['AR-B']`. Not observed in April corpus.
- **Slug normalization**: the URL `/promociones/ualabis` (no dash) vs `/promociones/ualá-bis` (accented). Only `ualabis` is live; the accent-form is not canonical.
- **Ignored slug**: `/uala-mas` (Ualá+ loyalty program explainer, NOT a promo). The hub parser explicitly skips this slug via `IGNORED_SLUGS` in `scripts/ingestion/uala-hub.ts`.

## Known gaps

- **Hub size is 4 merchants on the live corpus** — this is a genuine Ualá catalog size, not a scrape problem. We can't manufacture more merchants; what you see is what exists in April 2026.
- **The hub card itself doesn't carry the tope**, only the detail page does. So the workflow is: hub scrape → enumerate slugs → one detail scrape per slug (costs = 1 hub + N detail credits). On 4 merchants this is 5 Firecrawl credits / run.
- **Extractor is per-url one-shot**: if Ualá ever runs a multi-rate promo on a single detail page, we'd need `variants[]` support (not currently emitted). No such case observed.
- **No Spanish month parser for arbitrary dates in the legal text** (beyond "Válido hasta: Hasta el DD de MMMM YYYY"). If T&Cs name a specific vigencia like "del 1 al 15 de abril", that's not extracted separately — the prompt defaults to first/last of current month. Acceptable because Ualá's `Válido hasta` block is usually explicit.

## Good assertions for the testing agent

- [ ] Hub parser: `parseHubSlugs(md)` returns the expected slug list, skips `uala-mas` and other ignored paths, dedups, sorts.
- [ ] Carrefour fixture: extractor produces `merchant='Carrefour'`, `pct=10`, `tope=null`, `valid_days=[6]` (Saturday — parsed from legal text, NOT default-to-all-7).
- [ ] `ualaPromoId('carrefour') === ualaPromoId('carrefour')` (deterministic) and `!== ualaPromoId('coderhouse')`.
- [ ] Hash-compare skip: on a second run, if the detail markdown is unchanged, `action='unchanged'` and zero Gemini cost.
- [ ] Canonical schema: `wallet: ['uala']`, `issuer_bank: ['uala']`.
- [ ] Schema gate: feed a malformed detail (e.g., no tope line at all, missing merchant heading) and assert the extractor throws with a clear reason.
- [ ] `Disponible en: Buenos Aires` → `valid_regions: ['AR-B']` (the mapping lives in the prompt; synthesize a fixture to exercise it).
- [ ] Cuotas-only merchants (if any appear): `pct=0`, `promo_type='cuotas'`.

## Gotchas / debugging notes

- **Hub fetch loads the whole page including an Ualá+ CTA, a QR download banner, etc.** — the markdown includes marketing copy. The prompt doesn't need to reason about that; we just extract links. Keep `onlyMainContent: true`.
- **Firecrawl `rawHtml` format is expensive on Ualá detail pages** — the CSR React tree expands to ~300 KB raw HTML (hit the output-too-big limit on first attempt). Keep `formats: ['markdown']` only. We don't need rawHtml for Ualá because there's no equivalent to MODO's `data-testid="day-of-week-selected-*"` signal — the icon row is purely CSS-classed.
- **Per-URL concurrency default = 3** — for a 4-merchant catalog, 1 hub fetch + 2 parallel detail extractions complete in ~5s.
- **`waitFor: 6000`** — Ualá's Next.js routes hydrate fast but the per-merchant page can flicker; 6000ms is the safe floor.
- **Live smoke cost**: ~$0.0066 Gemini / 5 Firecrawl credits / ~16s total. Cheap.

## Live smoke results (2026-04-19)

- First run (`--limit=4`, covers all current hub slugs): 4 inserted, 0 errored, $0.0066 Gemini, 15.8s.
- Idempotency / hash-skip: 0 inserted / 0 updated / 4 unchanged, $0.0000 Gemini (the hash-compare skip fires because `kind: per-url` — exactly the MODO behaviour).
- Tope coverage: 1/4 (Sportclub has a tope; Carrefour/Coderhouse/Ualá Bis are sin-tope).
