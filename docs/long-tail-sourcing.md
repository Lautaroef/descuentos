# Long-Tail Sourcing — Findings (April 2026)

Phase 2 validation. Scope: close the gap between MODO (already validated) and the long tail — Cuenta DNI, four non-MODO fintech wallets, and supermarket-native cupones. Evidence in `scripts/samples/cuentadni-press-extraction/` and `scripts/samples/long-tail/`.

## Verdict (per segment)

| Segment | Verdict |
|---|---|
| **Cuenta DNI** | **GO via press-article extraction.** 9/9 promos extracted first-try from one Ámbito roundup, near-full field coverage. Tier 3 → Tier 2. |
| **Brubank** | **GO via `/beneficios` scrape.** ~50 promos, fixed-label catalog (pct + tope + días + plan tier). Tier 3 → Tier 1 adjacent. |
| **Naranja X** | **GO via `/promociones` + category pages.** Open web catalog with tope, días, medios de pago. Tier 3 → Tier 2. |
| **Ualá** | **GO via `/promociones` hub + per-merchant detail pages.** MODO-grade fixed-label blocks. Tier 3 → Tier 2. |
| **Personal Pay** | **PARTIAL — go via hub + press triangulation.** Merchant + pct + días on web; topes in images. Tier 3 → Tier 2 (with a press assist). |
| **Coto cupones** | **GO.** Both `coto.com.ar/descuentos` and `cotodigital.com.ar/sitios/cdigi/descuentos` publish a MODO-grade catalog that includes the Comunidad Coto own-cupon (15% miércoles sin tope). |
| **Jumbo cupones** | **GO.** `/descuentos-del-dia` (bank promos) + `/jumbo-al-cien` (pesoscheck program, unique differentiator). |
| **Carrefour cupones** | **PARTIAL.** `/descuentos-bancarios` is an open cross-wallet catalog (including Cuenta DNI explicitly!). Per-user Mi Carrefour cupones are app-locked. |

**Bottom line**: every segment Phase 1 flagged as manual curation / app-locked has at least one viable web or press path. Tier 3 shrinks significantly.

## Cuenta DNI via press-article extraction

**Article tested**: [Ámbito — "Cómo ahorrar un 40% por semana con Cuenta DNI en abril"](https://www.ambito.com/economia/como-ahorrar-un-40-semana-cuenta-dni-abril-n6265995) (1 credit to scrape).

**Method**: `firecrawl_extract` with a Promo-aligned JSON schema. 851 tokens, 57 credits.

**Result**: **9 promos extracted**, covering every Cuenta DNI rubro active in April 2026 (ferias/mercados 40% / tope $6k semanal, comercios de cercanía 20% / $5k / lun-vie / min $25k, marcas destacadas 30% / $15k/mes, gastronomía 25% / $8k / fin de semana, Full YPF, universidades, librerías, farmacias, supermercados + 5% jubilados). Cross-checked against Infobae's independent April roundup — same figures, zero divergence.

**Schema validation**: 7/9 validate cleanly against the canonical `Promo` Zod schema as-is. 2/9 are the "sin tope" cases (Librerías, Farmacias) where the LLM correctly set `tope: null` AND `tope_period: null`. Current schema requires `tope_period` to be a non-null enum. **Trivial fix**: make `tope_period` nullable-when-tope-is-null, or default to `'month'`. Done in one line.

**Field coverage** (9 promos × 11 canonical fields = 99 cells):

| Field | Populated | Notes |
|---|---|---|
| merchant | 9/9 | Article uses consistent headings ("Ferias y mercados bonaerenses", etc.) |
| category | 9/9 | LLM mapped gastronomía/farmacia/super/combustible correctly |
| wallet | 9/9 | All `['cuentadni']` |
| pct | 9/9 | 5, 10, 20, 25, 30, 40 all correct |
| tope | 7/9 | 2 nulls = correct (article says "sin tope") |
| tope_period | 7/9 | 2 nulls paired with tope=null |
| valid_days | 9/9 | lun-vie → [1..5], sáb-dom → [5,6], todos → [0..6] |
| valid_regions | 9/9 | AR-B (supplied as default via prompt) |
| valid_from | 9/9 | 2026-04-01 (default) |
| valid_to | 9/9 | 2026-04-30 (default) |
| requires_min_spend | 1 captured | $25.000 for comercios de cercanía, derived from "se alcanza con $25.000 en compras" |

**Verdict**: **VIABLE for Tier 3 semi-automation.** Field coverage matches MODO detail pages. Cost per month ≈ 1 credit (scrape) + 57 credits (extract) × 3 articles for triangulation = ~175 credits/month for all Cuenta DNI. Near-zero operator burden.

**Portal re-verification** (`bancoprovincia.com.ar/cuentadni/contenidos/cdniBeneficios`): confirmed marketing-only. 371 KB markdown, 0 JSON-LD blocks, 0 `/api/` hints, 0 embedded promo JSON. Phase 1 was right.

**Alternative if press rots**: r/DescuentosArgentina publishes a monthly Cuenta DNI infographic PNG — Firecrawl cannot OCR PNGs natively, but the thread's *comments* (which transcribe the infographic) are scrapeable. Not tested but flagged as fallback.

## Fintech wallets

Per-wallet scrape results (all 1 credit each, basic proxy, Firecrawl markdown with `waitFor: 5000`):

| Wallet | URL tested | Content type | Structured promos visible | Recommended path |
|---|---|---|---|---|
| **Brubank** | `brubank.com/beneficios` | Fully rendered Webflow catalog | ~50 cards w/ `NN% reintegro / Tope $N.NNN / Todos los días` grouped by Plan One / Plus / Ultra | Firecrawl + LLM extract; model plan tier in `issuer_bank` as `brubank-one`/`-plus`/`-ultra` |
| **Naranja X** | `naranjax.com/promociones` + `/promociones-amba` + `/promos-relampago` + `/smartes` + `/pagar-transporte` | SPA, Firecrawl-resolved | Hub shows headline pct + `Tope semanal hasta $N` + day phrase + medio (Débito/Crédito/QR/Dinero en cuenta). Category pages per rubro. Plan Épico/Turbo tiers documented on blog. | Firecrawl + LLM extract on hub + category pages |
| **Ualá** | `uala.com.ar/promociones` + `/promociones/<merchant-slug>` | Next.js, Firecrawl-resolved | Hub lists ~4-10 merchants; per-merchant pages have MODO-grade fixed-label blocks (Días/Métodos/Válido hasta/Tope/Disponible en + full T&Cs) | Firecrawl + LLM extract per-merchant slug |
| **Personal Pay** | `personalpay.com.ar/beneficios` (301→`personal.com.ar/pay/beneficios`) | AEM, rendered, paginated | ~96 partners visible (8 pages × 12). Each card shows merchant + pct + días. **Topes only in summary image** (`Desk_tabla_v2.webp`) | Scrape hub pages 1-8 for merchant list; get tope via press article triangulation (e.g., promociones.com.ar combo article gives Nivel 3 topes) |

**The app-API reverse-engineering angle**: searched GitHub and dev blogs for `naranja-x-api`, `personal-pay-reverse-engineered`, Ualá/Brubank. **No public repos found.** Conclusion: don't decompile, don't need to — the public web surfaces are sufficient.

**Press-extraction triangulation test** (the promociones.com.ar combo article, Feb 2026):

Extracted cleanly: Plan Turbo martes (Naranja X 25% super tope $12k/sem), Personal Pay Nivel 3 (20% super+combustible tope $8k), Naranja X transporte NFC (100% reintegro tope $20k/mes), Personal Pay Flow/servicios ($3.500 reintegro factura), requisitos de nivel (>$150k gasto mes anterior = Nivel 3). Caveat: promociones.com.ar reads as low-effort content farming — cross-verify against iProUp / iProfesional before trusting.

**Cross-chain confirmation**: the Carrefour `/descuentos-bancarios` page **explicitly names** Cuenta DNI, Personal Pay, Ualá, Naranja X, BNA+, Prex as participating billeteras in a "10% sin tope" universal cross-wallet promo. Supermarkets themselves document the wallets we thought were siloed.

## Supermarket-native cupones

Per-chain results:

| Chain | URL tested | Auth-gated? | Cupones/promos present? | Extraction path |
|---|---|---|---|---|
| **Coto** | `coto.com.ar/descuentos/` + `cotodigital.com.ar/sitios/cdigi/descuentos` | No | Yes — cross-bank catalog with tope + día + bank logo. **Comunidad Coto 15% miércoles sin tope** is listed here (own-cupon). | Firecrawl + LLM extract. 1 credit/refresh. |
| **Jumbo** | `jumbo.com.ar/descuentos-del-dia` + `/jumbo-al-cien` + `/eventos/descuentos-jumbo-prime` | No | Yes — bank promos with tope + vigencia. **Jumbo al 100** is a monthly pesoscheck cupon program (emisión + canje windows). | Firecrawl + LLM extract. Monthly re-scrape for Jumbo al 100 slug. |
| **Carrefour** | `carrefour.com.ar/descuentos-bancarios` + `/promociones` + `/especial-cupones` | `/especial-cupones` = explainer only. `/descuentos-bancarios` = full catalog (open). Per-user cupones = **Mi Carrefour app, locked**. | Yes in `/descuentos-bancarios`: 29+ pct promos, 52+ topes, all days, includes Mercado Pago + Cuenta DNI + all billeteras. | Firecrawl + LLM extract on `/descuentos-bancarios`. Mi Carrefour per-user cupones stay manual / press-only. |

**VTEX coupon API finding**: **No.** Probed `/api/catalog_system/pub/coupons`, `/api/checkout/pub/coupons`, `/api/catalog_system/pub/promotions` across Día / Carrefour / Jumbo — all 404. `/api/io/coupons` returns the VTEX SPA shell HTML, not JSON. However, the Carrefour HTML references `carrefour.com.ar/api/dataentities/BP/documents/{uuid}/img_card_N/attachments/{wallet}.png` — suggesting the promo catalog IS in a VTEX dataentity called `BP` that may be queryable via `/api/dataentities/BP/search?_fields=...` with the right entity ID. Not tested; flagged as a follow-up optimization that could replace HTML scraping with JSON fetch.

**Own-cupon programs captured**:
- Comunidad Coto 15% miércoles sin tope (membership-gated, free)
- Jumbo al 100 monthly pesoscheck cycle (emisión window + canje window, per-month slug rotation)
- Mi Carrefour per-user cupones (app-locked — refer to press coverage only)

## Impact on product thesis

The wedge (sort by tope) **broadens materially**. Phase 1's implicit universe was "MODO + MP + VTEX" ≈ 100 bank-ecosystem promos. Phase 2 adds:

- **Cuenta DNI**: ~9 promos/month (active rubros), press-extracted
- **Brubank**: ~50 promos
- **Naranja X**: ~20-40 promos across Plan Turbo/Épico + promos-amba + promos-relampago + smartes
- **Ualá**: ~10-20 promos (hub + per-merchant detail)
- **Personal Pay**: ~96 partners (hub) + tier-based topes from press
- **Coto cross-bank catalog**: ~50 promo blocks, many not in MODO
- **Jumbo cross-bank catalog**: ~25 promo blocks + pesoscheck program
- **Carrefour cross-bank catalog**: ~29+ promo blocks including Cuenta DNI and cross-wallet universal promos

**Estimated coverage of AR deal-hunter's promo universe** with MODO + long-tail findings combined: **~85–90%**. The remaining 10–15% is per-user app-only cupones (Mi Carrefour birthday cupon, personalized Cuenta DNI push notifications, per-user Mercado Pago perks). These are genuinely individual and no aggregator can surface them without per-user OAuth into each app — out of scope.

**Coverage gains over the closest public analog (PromoArg, see `competitor-promoarg.md`)**:

- Supermarket-native own-cupones (Comunidad Coto, Jumbo pesoscheck, Mi Carrefour mentions) — PromoArg does not source these.
- Structured topes for Brubank / Ualá / Naranja X / Personal Pay — PromoArg's bank filter caps at 100 and covers these thinly.
- Press-article extraction for Cuenta DNI is cheaper and more current than manual curation.

## Updates to other docs

### `docs/data-sources.md`

Changes made in-place:
1. Add a new Tier 2 bucket for "Wallet web catalogs" covering Brubank, Naranja X, Ualá, Personal Pay.
2. Move Cuenta DNI from Tier 3 manual curation → Tier 2 press-article extraction with the canonical method documented.
3. Add a Tier 2 bucket for "Supermarket-native cross-wallet catalogs" covering Coto, Jumbo, Carrefour.
4. Update the "Wallets" Tier 3 section to reflect that most wallets have web surfaces — only per-user in-app cupones remain genuinely unreachable.
5. Add the Carrefour BP dataentity hint as a follow-up optimization.

### `docs/README.md`

Add this file to the reading order after `competitor-promoarg.md` (as doc 7).

### `scripts/promo-schema.ts`

Not edited in this phase (validation-only), but flag: `tope_period` should be `z.enum([...]).nullable()` so "sin tope" promos validate cleanly. Current rule forces 7/9 pass instead of 9/9 on the Cuenta DNI extraction sample.
