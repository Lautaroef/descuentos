# Information Architecture & User Flows

> D3 synthesis for Descuentos AR. Navigation structure, primary flows, filter model, and state-by-state UX spec. Pair with `direction.md` and `components.md`.

---

## Guiding IA principles

Three non-negotiables from the research:

1. **The deal-hunter is in "knowing mode," not "discovery mode."** The app answers *"which of my wallets wins today?"* — not *"what's out there?"* (D2).
2. **Smart default + optional refinement.** Never gate the answer on a form (D2, NN/g). First screen is always already-answered for the returning user.
3. **Single-screen posture.** This is a PWA with a narrow job. One destination (home), one detail view, a few SEO landings. No dashboard, no tabs, no drawers.

---

## Navigation structure

### The call: **Top header only. No bottom tab bar. No drawer.**

Rationale:

- A bottom tab bar implies ≥3 top-level destinations. We have **one** primary destination (the home ranked list) plus landing pages (banco/, categorias/) that are discovered, not navigated-between. A tab bar would be inventing destinations to fill.
- The D1 "bottom tab bar is universal in fintech" observation is context-specific — MP, MODO, Nubank are *multi-surface apps* (accounts, transfers, promos, QR, investments). We are a single-surface tool. Tab bar on a one-job app reads as over-scaffolded.
- Mobile real estate: PromoCard needs vertical air. Stealing 56px for a tab bar costs us one card's worth of list visibility per screen.

### Top header spec (NavBar)

Sticky at top, 56px tall mobile / 64px desktop. Background `--color-bg` with 1px bottom border `--color-border`. Contents left-to-right:

- **Wordmark** — "Descuentos" in Inter 600 weight, 18px, `--color-text-primary`. No logo mark. The word IS the brand.
- Flex spacer.
- **Install PWA affordance** (mobile first-time only): small pill button "Instalar app" — shows only if `beforeinstallprompt` has fired and the user hasn't installed. Dismissable with "×". After dismiss, never shown again.
- **Search affordance** (desktop only, optional for v1): right-aligned search icon opening an inline search over merchant names. Defer this to Phase 5 — not MVP.

No hamburger. No "more" menu. No avatar. The header is a wordmark and a tip jar, nothing more.

### Secondary navigation

Contextual, appears only on SEO landing pages and detail pages:

- **Back link** ("← Volver al listado") top-left under the header, on `/p/[id]`, `/banco/[slug]`, `/categorias/[slug]`.
- **Cross-links** at the bottom of each landing page: "Otros bancos" (pills) and "Otros rubros" (pills). Current implementation already does this — keep.

---

## Primary user flows

### Flow 1: Fresh visit → top promos → install PWA

**Target: 1 scroll, 0 clicks to see the best promo.**

1. User lands on `/` (no query params).
2. Server renders the ranked list immediately (no auth, no gate, no splash). Top card is above the fold.
3. OnboardingSheet fades in 600ms after first paint. It's dismissible with "Ahora no" OR with a tap on the backdrop.
4. User either:
   - Selects wallets → sheet dismisses → list re-filters to "wallets you have" with a visible diff indicator (e.g., *"Mostrando 18 de 97 promos que podés usar — [ver todas]"*).
   - Taps "Ahora no" → sheet dismisses permanently → sees unfiltered list.
5. Install PWA pill appears in the header if eligible. One tap to install. Dismissible permanently.

**Key constraint:** the ranked list is visible behind the onboarding sheet. User can see the content while the sheet exists. No blocking overlay.

### Flow 2: Returning visit → owned-wallet filter pre-applied → today's answer

**Target: 2 taps from home to "I'm going to buy here."**

1. User opens the installed PWA (or types the URL).
2. Server reads the SSR URL params IF present; otherwise client-hydrates owned-wallets from localStorage and *soft-redirects* to `?wallet=modo,mercadopago` WITHOUT a navigation jump (history.replaceState).
3. User sees: ranked list filtered to their wallets. Top card is "today's best play."
4. Tap 1: user taps the top card → PromoDetail opens.
5. Tap 2: user taps "Ir al sitio" → external link opens.

**Important:** step 2 pre-fills URL params from localStorage ONLY when the URL is clean. If a URL came with `?wallet=...` or from a share link, respect it — don't overwrite. This is how shared links work even when the user has their own wallet prefs.

### Flow 3: Share-link inbound

**Target: 0 taps. Already answered.**

URL shapes we support:
- `/?wallet=modo&rubro=supermercado` — filtered home.
- `/p/<uuid>` — direct promo.
- `/banco/<slug>` — SEO landing page for a bank (already implemented).
- `/categorias/<slug>` — SEO landing page for a category (already implemented).

Behavior:
- SSR renders the filtered view immediately. No client-side filter re-render flicker.
- A subtle one-time toast appears at the top: *"Te compartieron esta promo"* on `/p/<uuid>` entries from external referrer. Dismisses after 3s. Optional, low-priority for MVP.
- Inbound filter state DOES NOT overwrite the user's localStorage. Their own prefs persist; the current session respects the shared-link context only.

### Flow 4: Bank deep-dive

**Target: 1 tap from home.**

Users who type "banco galicia promos" into Google should land on `/banco/galicia`. On-site:

1. From home: a user sees a bank pill on any PromoCard (e.g., "Galicia"). Tap → `/banco/galicia`.
2. The `/banco/[slug]` page shows that bank's best promos ranked by tope.
3. Same card → detail flow as above.

Current implementation already handles this. Keep URL shape.

### Flow 5: Explore by category

Entered via `/categorias/supermercado` (SEO) or by tapping a category chip on home FilterBar. Otherwise identical to Flow 4.

---

## Filter model

### Where filters live

**Inline chip bar above the list, persistent across scroll via sticky positioning.** Not a sheet. Not a sidebar.

- Filters are part of the answer view — hiding them in a sheet creates an extra tap between "I want to narrow this" and "I see the result." Filter = data, not modal action.
- Sticky behavior: on mobile, the FilterBar sticks to the top of the viewport (below the 56px header) once the user scrolls past the page title. Desktop: chip bar is inline with page content, no sticky.

### Filter hierarchy

Three filter groups, in this order:

1. **Billetera** — multi-select chip row. Pre-filled from onboarding / localStorage. The primary filter.
2. **Rubro** — single-select chip row. Default: none (show all).
3. **Día** — single-select toggle: `Hoy` (default), `Mañana`, `Esta semana`, or specific day. On touch: swipeable horizontal chips. `Hoy` is pre-selected on fresh load.

Additional filters (deferred to Phase 5):
- Región (currently in impl as a select, keep but de-emphasize — behind a "Más filtros" disclosure).
- Tope range.
- Min spend.

### Active-filter communication

- Active chips: `--color-accent-soft` fill, `--color-accent` ink, 1px `--color-accent` border. Inactive chips: `--color-surface` fill, `--color-text-secondary` ink, 1px `--color-border`.
- Result count sentence above the list: `Mostrando 18 de 97 promos · [Limpiar filtros]`. The "Limpiar" button only renders when at least one non-default filter is active.
- No separate "Filters (3)" badge — the chips ARE the active state. No double-representation.

### Reset behavior

- `Limpiar filtros` button (pills-shaped, small, muted) appears inline with the result count.
- Tap → clears URL params, resets to unfiltered list, clears `wallet` localStorage.
- Important: resetting clears onboarded wallets. We trust the user's intent. Re-onboarding is not re-triggered; user can re-onboard via a settings screen (Phase 5).

### Sort order

Fixed: `tope DESC NULLS LAST`. This is the wedge — see `product.md`.

- Sin-tope promos are not interleaved with tope-having promos; they go into the collapsed "Sin tope declarado" section at the bottom (see `components.md` → Sin-tope section).
- No alternative sort options in v1. "Ordenar por descuento %" could be added later as a secondary chip — deferred.

---

## Onboarding flow redesign

### Current implementation (what to replace)

`src/components/OnboardingSheet.tsx` — a dark modal over the entire viewport, asking for wallets. Functional, but:

- Dark backdrop with 60% opacity, no paper-warmth.
- Reads as a signup gate rather than a helpful offer.
- "Guardar" button feels form-ish.

### New spec

**A delightful, skippable 10-second moment. Paper-feel, warm, low-stakes.**

Shape: bottom sheet (full-width on mobile, centered floating sheet max-width 440px on desktop). Enters from below with a 320ms translateY animation; backdrop is `rgba(20, 17, 12, 0.32)` — warm, not cold black.

Content order:

1. **Title**: `¿Qué billeteras tenés?` (`--text-lg` weight 600, primary ink). The question feels personal — "have," not "use."
2. **Subtitle**: `Marcá las tuyas y te mostramos primero las promos que podés usar.` (`--text-sm` muted).
3. **Wallet chips** — 7-8 pills in a flex-wrap grid. Each pill is 44px tall, `--radius-pill`, merchant-familiar labels ("MODO", "Mercado Pago", "Cuenta DNI", "Ualá", "Naranja X", "Personal Pay", "Brubank"). Selected state: `--color-accent-soft` + `--color-accent` ink + 1.5px `--color-accent` border.
4. **Primary CTA**: `Guardar` button — `--radius-sm`, full-width on mobile, accent fill, white ink. Disabled if 0 selections (soft disabled: 40% opacity, no cursor change).
5. **Secondary action**: `Ahora no` — plain text link, muted, below the CTA. Tap → dismisses permanently.

Interaction details:
- Tapping a chip does NOT dismiss the sheet. Multiple selections allowed.
- Keyboard: Esc closes (marks onboarded, skips).
- Close button (X, top-right): also acts as "Ahora no" — marks onboarded.
- Tap outside the sheet: same as close button.

State behavior:
- On first load, sheet fades in 600ms after page first paint. This gives the user time to see the product behind the sheet FIRST, so the onboarding feels like an offer, not a paywall.
- On dismiss: stored in `localStorage['descuentos-ar:onboarded'] = '1'`. Never shown again unless user clears localStorage or hits a future "Editar billeteras" button (Phase 5).

**Tone**: the sheet should feel like *"hey, if you tell us, we can show you better stuff"* — not *"we need to know before you see the product."* The product is visible behind it at all times.

---

## Empty states

### Filter-empty: "no promos match your filters"

**Shape**: centered in the list area, 64px vertical padding, 120px spot illustration (empty-cart line drawing per `direction.md`), single-line copy, CTA.

**Copy**:
- Headline: `No hay promos con esos filtros hoy.`
- Subcopy: `Probá aflojar alguno y te mostramos más.`
- CTA (pill): `Limpiar filtros` — secondary action.

No "contact us," no "try again later." This is a user-action-fixable state; the copy trusts the user.

### Zero-data: DB empty / ingestion down

Rare — only happens if the ingest pipeline has wholly failed.

**Copy**:
- Headline: `Estamos refrescando la base.`
- Subcopy: `Volvé en un rato — normalmente está listo en minutos.`
- No CTA. Quiet, honest, low-drama.

### Inbound empty (share link that no longer matches)

Example: user opens a shared `/?wallet=uala&rubro=combustible` where no promos currently exist.

**Copy**:
- Headline: `Esta combinación no tiene promos hoy.`
- Subcopy: `Puede ser que la promo que buscabas ya no esté activa. Mirá el resto.`
- CTA: `Ver todas las promos` → clears the filters.

---

## Loading states

### Initial page load

SSR-rendered — zero loading state on first visit. The list is in the HTML.

### Client-side filter changes

The FilterBar commits filter changes via `router.push`. Next.js SSRs the next state; during the transition:

- `PromoList` dims to 70% opacity.
- `aria-busy="true"` on the container.
- No spinner — the transition is typically <200ms and the dim is sufficient feedback.
- If latency exceeds ~600ms (rare): a subtle 2px indeterminate progress bar appears under the FilterBar, `--color-accent`, translating left-to-right in a 1800ms loop.

### Skeleton strategy

Skeletons only appear in one place: if for some reason a page is navigated to before SSR data is ready (future streaming RSC case). Spec:

**PromoCard skeleton** — same dimensions as the real card, but content replaced with:
- Merchant name: 60% width grey bar, 16px tall, `--radius-xs`, `--color-surface-sunken` fill with shimmer.
- Pct number: 40px × 24px rectangle, right-aligned.
- Tope line: 80% width grey bar, 14px tall.
- Bank pills: 3 small pill shapes.
- Timestamp: 50% width bar, 11px tall.

Shimmer: linear gradient 90deg, `--color-surface-sunken` → `--color-surface` → `--color-surface-sunken`, background-size 200% 100%, animation `shimmer 1800ms linear infinite`.

---

## Error states

### Page-level 500 / data fetch failure

Shape: centered empty state with muted iconography.

**Copy**:
- Headline: `Algo se trabó.`
- Subcopy: `No pudimos traer las promos. Probá recargar.`
- CTA: `Recargar` → `window.location.reload()`.

No stack trace. No "support@" (we're not a support org). Accept-and-retry.

### 404 (promo deleted / slug wrong)

Existing `src/app/not-found.tsx` — rewrite copy to our voice:

**Copy**:
- Headline: `Esta promo no existe.`
- Subcopy: `Puede que la hayamos dado de baja porque ya no está vigente. Mirá las promos activas.`
- CTA: `Ver promos` → `/`.

### Network failure (client-side filter commit)

Silent retry once; if still fails, a toast: `Sin conexión. Intentá de nuevo.` at the bottom, self-dismissing after 4s.

---

## Page inventory & URL shape

| URL | Purpose | SSR | Notes |
|---|---|---|---|
| `/` | Home ranked list | yes (revalidate 3600) | Default sort by tope; filter via search params |
| `/?wallet=X,Y&rubro=Z&dia=3` | Filtered home | yes | Every filter is a URL param (SSR truth) |
| `/p/[id]` | Promo detail | yes | UUID v5 stable across ingests |
| `/banco/[slug]` | Bank landing | yes (revalidate 3600) | SEO target; keep current slug list from `BANK_SLUGS` |
| `/categorias/[slug]` | Category landing | yes (revalidate 3600) | Same pattern as bank |
| `/sitemap.xml`, `/robots.txt` | SEO infra | — | Already implemented |
| `/manifest.webmanifest` | PWA install | — | Already implemented |

### Explicitly NOT in v1

- `/account`, `/profile`, `/settings` — no accounts yet.
- `/about`, `/faq`, `/contact` — lean; if added, a single `/acerca-de` page in Phase 5.
- `/favoritos`, `/watchlist` — Phase 5 per build-plan.
- `/simulador` (household simulator) — Phase 4 per build-plan, but its own page then.

---

## Layout specifications

### Home layout (desktop, 1024+)

```
┌─────────────────────────────────────────────────────────┐
│ [NavBar]                                                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Descuentos                                             │
│  Hoy te conviene...                            97 activas│
│                                                         │
│  [Billetera]  [Rubro]  [Día]                            │
│  (sticky)                                               │
│                                                         │
│  Mostrando 18 de 97 · [Limpiar]                         │
│                                                         │
│  ┌────────┐  ┌────────┐  ┌────────┐                     │
│  │ Card 1 │  │ Card 2 │  │ Card 3 │                     │
│  └────────┘  └────────┘  └────────┘                     │
│  ┌────────┐  ┌────────┐  ┌────────┐                     │
│  │ Card 4 │  │ Card 5 │  │ Card 6 │                     │
│  └────────┘  └────────┘  └────────┘                     │
│                                                         │
│  ── Sin tope declarado · 12  (collapsed) ──             │
│                                                         │
│  [Disclaimer footer, quiet]                             │
└─────────────────────────────────────────────────────────┘
```

### Home layout (mobile, <640)

```
┌──────────────────────────┐
│ [NavBar]      [Instalar] │
├──────────────────────────┤
│ Descuentos               │
│ Hoy te conviene...       │
│ 97 activas               │
│                          │
│ [Billetera chips →]      │
│ [Rubro chips →]          │
│ [Día: Hoy / Mañana / ⋮]  │
│                          │
│ 18 de 97 · [Limpiar]     │
│                          │
│ ┌──────────────────────┐ │
│ │      Card 1          │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │      Card 2          │ │
│ └──────────────────────┘ │
│                          │
│ ─ Sin tope · 12 ─        │
└──────────────────────────┘
```

### Detail layout (`/p/[id]`)

```
┌──────────────────────────────────────┐
│ [NavBar]                             │
├──────────────────────────────────────┤
│ ← Volver al listado                  │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ [Supermercado]                   │ │
│ │                                  │ │
│ │ Carrefour                        │ │
│ │                                  │ │
│ │         $25.000       25%        │ │
│ │         tope máximo   reintegro  │ │
│ │                                  │ │
│ │ ─────────────────────────────    │ │
│ │                                  │ │
│ │ Válido   miércoles               │ │
│ │ Vigencia 01/04 – 30/04           │ │
│ │ Tope     por semana              │ │
│ │ Billetera  MODO                  │ │
│ │ Compra mín.  $5.000              │ │
│ │                                  │ │
│ │ Bancos adheridos                 │ │
│ │ [Galicia] [Santander] [+3]       │ │
│ │                                  │ │
│ │ Verificado hace 3 días           │ │
│ │ Fuente: modo.com.ar              │ │
│ │                                  │ │
│ │        [Ir al sitio  ↗]          │ │
│ └──────────────────────────────────┘ │
│                                      │
│ [Disclaimer block, boxed quiet]      │
└──────────────────────────────────────┘
```

Detail hero is the **single focus**: pct + tope juxtaposed centrally with the count-up animation on arrival.

---

## Running savings total (gamification, capped)

### The call: **monthly, opt-in, ambient, collapsible.**

Per D2: running totals motivate; streaks and "you missed X" scold loss-averse users. The lever is non-scolding presence.

### Implementation posture (MVP behavior)

- **Not in MVP.** For Phase 2 we're not tracking user purchase events. Adding this requires either:
  - Self-reporting ("marqué que compré con esta promo") — low friction but forgetful.
  - Bank-account integration (Belvo / PSD2-style) — out of scope per `product.md`.
- **Placeholder for Phase 5:** design a collapsed card on the home above the filters that shows *"Este mes ahorraste ~$8.400"* ONLY if the user has opted in and self-reported. Collapsible into a single line. Tap expands to a simple history list.
- In v1, this block simply doesn't render. The feature is on the roadmap but not on the surface.

Explicitly rejected:
- Weekly savings goals.
- Streak counters.
- "Te perdiste X promos" notifications of any kind.

---

## Push notifications

### The call: **v1 ships with no notifications.**

D2 is explicit on the loss-aversion risk of "you missed a deal" pings. A narrow "your favorite deal ends in 2 hours" notification may be added in Phase 5 tied to favorites, but favorites themselves don't exist yet.

MVP PWA requests no notification permission. The manifest does not advertise notification capability. Clean install.

---

## Accessibility posture

- All interactive surfaces ≥44×44 CSS px tap target.
- Focus ring: `--shadow-focus` (3px ring at 20% accent), visible on all keyboard focus.
- Text contrast: body text `--color-text-primary` on `--color-bg` = 14.2:1 (AAA). `--color-text-secondary` on `--color-bg` = 7.1:1 (AAA). `--color-text-muted` on `--color-bg` = 4.9:1 (AA). `--color-accent` on `--color-bg` = 5.6:1 (AA). `--color-savings-strong` large text on `--color-bg` = 7.8:1 (AAA).
- All color-coded states also carry text or icon — never color-only per D1 Stripe rule.
- Semantic HTML: `<main>`, `<article>`, `<nav>`, `<section>`, `<header>`, `<footer>` used correctly (current impl largely does this).
- `lang="es-AR"` on `<html>` — keeps screen readers in Argentine Spanish voice.
- Skip-link ("Saltar al contenido") at the top, visible on focus only, jumps to the PromoList container.
- Motion: all non-essential animation disabled under `prefers-reduced-motion: reduce`. Count-up animation falls through to an instant render.

---

## What D4 should NOT build yet

Scope control — the roadmap covers these, don't sneak them in:

- Household simulator (Phase 4).
- Opportunity view ("if I opened Naranja X…") (Phase 4).
- User-correction form (Phase 4).
- Favorites / watchlist (Phase 5).
- Search by merchant name (Phase 5).
- Dark mode (post-launch, if requested).
- Push notifications (Phase 5 at the earliest).
- Multi-tenant / accounts (not in v1).

The redesign D4 ships is a **visual and tonal overhaul of existing Phase 2 surfaces**, not new features.
