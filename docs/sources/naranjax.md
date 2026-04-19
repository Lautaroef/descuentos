# Naranja X — Source Guide

Phase 3.2 wallet source. Shipped 2026-04-19.

## What this source covers

- **Wallet**: Naranja X (Plan Z / Plan Turbo / Plan Épico — fintech card + loyalty program, Argentina).
- **URLs**: 5 hubs (see below).
- **Merchants**: ~40–80 promo cards per hub — mostly cuotas-sin-interés (pct=0), a few cashback cards with explicit `Tope semanal` lines. On first live run (2 hubs sampled), 58 promos total.
- **Data shape per card**: headline (`Hasta NN% OFF` / `N cuotas cero interés` / combo), optional `Tope semanal hasta $N.NNN`, day phrase, merchant heading, payment-medium icons.
- **Region scope**: national for `/promociones`; AMBA (`AR-C + AR-B`) for `/promociones-amba` (labeled by the prompt).

## Endpoints scraped

| URL | `kind` | Notes |
|---|---|---|
| `https://www.naranjax.com/promociones` | `bulk` | General hub (featured + cuotas-by-category). |
| `https://www.naranjax.com/promociones/SUPERMERCADOS_categoria` | `bulk` | Supermarkets — contains the core wedge (Martes 25% $12k/sem). |
| `https://www.naranjax.com/promociones-amba` | `bulk` | Buenos Aires metro regional promos. |
| `https://www.naranjax.com/promos-relampago` | `bulk` | "Último sábado del mes 40% OFF" flash deal. |
| `https://www.naranjax.com/smartes` | `bulk` | Monthly "Sale Days" (Smartes 2026). |

All use `formats: ['markdown']`, `waitFor: 6000` (Naranja X is SPA-ish, needs the longer wait).

## Canonical id strategy

```
id = uuidV5(`${source_url}#${merchant}#${pct}#${days-label}`, NARANJAX_NAMESPACE)
```

- **Tupled on `source_url`** (not a cross-hub canonical). Rationale: the SAME promo may appear on multiple hubs (e.g., the Martes Supermercados 25% deal is on both `/promociones` and `/promociones/SUPERMERCADOS_categoria`). Keying on `source_url` preserves provenance per hub. Phase 4 dedup will collapse content-equivalent rows across hubs via a canonical hash. This mirrors Cuenta DNI's policy.
- `merchant + pct + days-label` is the within-hub dedup key — if the extractor emits the same card twice (e.g., because it was listed in a "featured" slot and a category slot on the same page), the second emission is skipped.

## Fixtures saved

- `scripts/samples/long-tail/wallets/naranjax/promociones-hub.md` — general `/promociones` markdown (2026-04-18 / 2026-04-19 capture).
- `scripts/samples/long-tail/wallets/naranjax/promociones-hub.extract.json` — 4-promo hand-curated known-good (covers cashback w/ tope, cashback w/o tope, mixed-off, and a martes-only merchant).
- `scripts/samples/long-tail/wallets/naranjax/promociones-supermercados.md` — category hub markdown.

## Edge cases discovered

- **Cuotas-only cards** ("14 cuotas cero interés", "12 cuotas cero interés"): pct=0, tope=null, promo_type='cuotas'. The prompt handles this explicitly. They still produce rows — they're valid data, just not eligible for the "sort by tope" wedge. The UI layer filters by `promo_type != 'cuotas'` for the tope-sorted view.
- **"Días seleccionados" (ambiguous day phrase)**: Naranja X's supermercado category cards use this when the T&Cs name multiple days. The prompt defaults to Martes (`[2]`) for supermercado + combustible (since Plan Turbo's wedge deal IS martes), and all-7-days for other categories. This is a heuristic — could regress if Plan Turbo ever moves off martes. Monitor.
- **"Hasta NN% off y N cuotas cero interés" combo cards**: promo_type='mixed'. The pct captures the off-portion; the cuotas-N isn't currently surfaced in the canonical Promo schema (future `variants[]` entry — deferred).
- **Regional geo**: Firecrawl's scrape hit the Naranja X geo-targeted hub, which showed "Newark" / "Leesburg" as detected location (Firecrawl's US proxy). The promos returned are the "national" set — the regional (e.g., Córdoba-specific) promos don't show up. Not a bug per se; the `/promociones-amba` hub explicitly surfaces regional AMBA promos as a separate list. Flagged for the testing agent — if we ever need granular AR geos, we need to pin Firecrawl to an AR proxy (not trivial).
- **Duplicate card emissions**: the LLM occasionally emits the same card twice (it's listed in both "featured" and "cuotas" sections). The id-based dedup (`seenIds` set in the extractor) handles this.
- **Tope period convention**: "Tope semanal hasta $12.000" → week. "Tope mensual" would be → month (not observed in corpus).

## Known gaps

- **Per-merchant detail pages are NOT scraped.** The hub/category cards carry the core fields (pct, tope, days, merchant, medios). Naranja X does have deeper per-merchant detail with full T&Cs but the current scope is hub-only to keep credits down.
- **"Plan Turbo / Plan Épico" tier is NOT encoded.** Unlike Brubank, we don't split Naranja X promos by plan tier — the hub cards don't consistently label which tier applies. The default Plan Z is universal; Turbo/Épico are layered perks. A press-triangulation pass could populate this later.
- **`/pagar-transporte`** is NOT in the default URL list. It's a single-purpose landing page ("100% OFF subte/colectivo") that the hub scrape covers indirectly. Added to the URL list would double-count. Kept out.
- **Image-only content**: Naranja X uses some banner cards for marketing (e.g. "hoteles del caribe" 55% OFF) — they scrape OK because the copy is in the card text, not locked in images. No OCR needed.

## Good assertions for the testing agent

- [ ] Live hub scrape produces ≥15 cards per hub.
- [ ] The core wedge promo (Supermercados Martes 25% tope $12.000 semanal) appears on the `/promociones` hub with `valid_days=[2]`, `tope=12000`, `tope_period='week'`.
- [ ] `/promociones-amba` hub produces rows with `valid_regions: ['AR-C', 'AR-B']` (verify the prompt branches).
- [ ] The same merchant scraped from `/promociones` vs `/promociones/SUPERMERCADOS_categoria` produces two distinct ids (provenance preserved).
- [ ] Cuotas-only cards → `pct=0`, `promo_type='cuotas'`, `tope=null`.
- [ ] "Días seleccionados" default to `[2]` for supermercado / combustible categories. If another heuristic is defined later, update this test.
- [ ] Duplicate emissions within one hub are deduplicated by id (seenIds) — feed an LLM payload with the same card twice and assert one row out.
- [ ] Idempotent re-run: 0 inserts / N updates.

## Gotchas / debugging notes

- **`waitFor: 6000`** — the default 5000 sometimes returns a partial grid. 6000 is the safe floor.
- **Firecrawl geo-proxy returns US-detected location strings ("Newark", "Leesburg")** — this is cosmetic; the data is unaffected. If a future run produces empty promos, check if the proxy flipped to a geo that Naranja X blocks.
- **5 hubs × ~60 promos avg = ~300 rows/run** is the ceiling. At ~$0.012 / hub extraction → ~$0.06 / run Gemini + 5 Firecrawl credits. Monthly weekly cadence budget < $1.
- **The supermercados `Los Martes` promo without a tope** (e.g., Dobro, Supermercado Depot, Milagro Mayorista — small retailers) is a genuine "sin tope" case, not a missing data point. These are regional-independent retailers Naranja X covers under the "Plan Turbo Martes 25%" universal program but without the category-level tope.

## Live smoke results (2026-04-19)

- First run (`--limit=2`, hubs `/promociones` + `/promociones/SUPERMERCADOS_categoria`): 58 inserted, 0 errored, $0.0230 Gemini, 29.2s.
- Idempotency: 0 inserted / 58 updated, same cost (hash-compare skip does NOT fire for `bulk` sources — see `source-runner.ts` comment; re-extraction is safe because ids are deterministic).
- Tope coverage: 1/58 (only the Supermercados Martes wedge card carries a tope on the hub). Press triangulation required for Plan Turbo topes on specific merchants (documented in `docs/long-tail-sourcing.md`).
