# Component Specs

> D3 synthesis. Implementation-ready specs for each core component. Pair with `direction.md` (tokens) and `system.md` (CSS values).

Conventions:
- All pixel values refer to tokens defined in `system.md`.
- Every microcopy string is voseo-compliant; exact strings in `direction.md` (microcopy bible).
- "State" = default, hover, active, focus, disabled. Touch devices skip hover.

---

## 1. PromoCard

**Role**: the hero. Every design tradeoff defers to this component.

### Visual anatomy

```
┌────────────────────────────────────────────────┐
│  [C]  Supermercado                   25%       │  ← header row
│       Carrefour                      reintegro │
│                                                │
│  Hasta $25.000 por semana                      │  ← tope line (hero)
│  Miércoles                                     │  ← valid_days
│                                                │
│  [Galicia] [Santander] [+3]                    │  ← bank pills
│                                                │
│  Verificado hace 3 días             Ver →      │  ← footer row
└────────────────────────────────────────────────┘
```

### Dimensions

- Padding: `--space-4` (16px) all sides.
- Gap between internal rows: `--space-3` (12px).
- Min card height on desktop: 196px (keeps grid rhythm even with short content).
- Corner radius: `--radius-md` (10px).
- Border: 1px `--color-border`.
- Background: `--color-surface` (#FFFFFF).
- Shadow: none by default; `--shadow-1` on hover.

### Information hierarchy inside the card

Reading from highest weight to lowest:

1. **Tope line (`Hasta $25.000 por semana`)** — this is the hero number. `--text-base` (16px), weight 600, color `--color-savings-strong`. The peso amount gets tabular numerals. The unit ("por semana") is the same size, weight 500, `--color-text-secondary`.
   - Rationale: this is the literal wedge. Per `direction.md`, tope is the answer.
2. **Pct (top-right)** — `--text-xl` (20px), weight 600, color `--color-savings`. The percent sign is same-size same-weight (no art-directed small %). Below the pct: `reintegro` in `--text-xs` weight 500 `--color-text-muted`.
3. **Merchant name** — `--text-base` weight 600 `--color-text-primary`. Truncates with ellipsis at 1 line. 32×32 initial avatar (see direction.md imagery) on the left, with `--space-3` gap between avatar and text.
4. **Category label** — `--text-xs` weight 500 `--color-text-muted`, all lowercase first letter (Spanish sentence case: `Supermercado` not `SUPERMERCADO`).
5. **Valid_days** — `--text-sm` weight 500 `--color-text-secondary`. Comma-separated ("Miércoles y jueves"). If `valid_days === null`, omit this row entirely.
6. **Bank pills** — small rounded-pill chips, `--color-surface-sunken` fill, `--color-text-secondary` ink, `--text-xs` weight 500, `--space-2` internal horizontal padding. Max 3 pills shown + "…y N más" whisper pill when banks array is long. No bank logos, text only.
7. **Footer row** — `--text-xs` weight 500 `--color-text-muted`. Left: `Verificado hace 3 días`. Right: `Ver →` in `--color-accent`. Footer has 1px top border `--color-divider`, `--space-3` top padding.

### States

- **Default**: as above.
- **Hover (hover-capable devices)**: border shifts to `--color-border-strong`; shadow fades in to `--shadow-1` over 150ms; `Ver →` shifts to `--color-accent-hover`. Cursor: pointer.
- **Active (pressed)**: scale 0.99, 150ms ease-out. Background tints 1% darker (`rgba(0,0,0,0.01)` overlay).
- **Focus (keyboard)**: `--shadow-focus` outline offset 2px. No scale change.
- **Loading skeleton**: separate state, see item #9.

### Tap behavior

- Entire card is a single tap target wrapping a `<Link>` to `/p/[id]`.
- Bank pills INSIDE the card are NOT independently tappable (avoids nested-link nesting; user taps card, gets to detail, can then tap bank).

### Variants

#### 1.A — Default (with tope)

As spec'd above. Tope line is the hero.

#### 1.B — Sin tope (tope === null)

Layout identical, but:
- Tope line replaced with: `Sin tope declarado` in `--text-base` weight 600 `--color-text-primary` (not green — this is information, not savings celebration).
- Pct chip in top-right renders **slightly larger**: `--text-2xl` (28px) weight 700 `--color-savings`. Because without a tope, the pct IS the measure.
- Everything else identical.
- Microcopy tooltip on tap-hold (optional): `Esta promo no declara tope. Todo tu consumo suma al reintegro.`

#### 1.C — Expiring soon

When `valid_to` is within 3 days of today, or exactly today:

- A thin 3px colored bar runs along the TOP EDGE of the card (inside the border radius), color `--color-warning`.
- Footer left slot changes from "Verificado hace..." to: `Termina hoy` / `Termina en 2 días` / `Termina mañana`, in `--text-xs` weight 600 `--color-warning`. Timestamp moves below as a second line, whisper-muted.
- No other visual change. No pulsing, no shake, no alert-red.
- Rule: this treatment kicks in AT MOST 3 days before `valid_to`. Never earlier.

#### 1.D — Zero-price (categorical)

Trigger: `pct === 100` OR `promo_type === '2x1'` OR `promo_type === 'bonificado' AND pct >= 50`.

- Background changes from `--color-surface` (white) to `--color-zero-bg` (warm yellow `#FFF3B8`).
- Pct slot: renders either the literal `100%`, `2×1`, or `50%` at `--text-3xl` (56px) weight 700 `--color-zero-ink` (near-black). This is the only card type where the pct is larger than the tope line.
- Tope slot changes to explanatory copy: `Es gratis` (for 100%), `Pagás uno, llevás dos` (for 2×1), or the usual tope line for bonificado.
- Border: 1px `--color-border` unchanged.
- Everything else identical. No icons, no "Free!" badge, no stars. The yellow tint is the whole shift.

### Microcopy examples (voseo)

| Surface | String |
|---|---|
| Tope line | `Hasta $25.000 por semana` |
| Tope line (no cap) | `Sin tope declarado` |
| Valid days | `Miércoles` / `Miércoles y jueves` / `Todos los días` |
| Bank overflow | `…y 3 más` |
| Footer fresh | `Verificado hace 3 días` |
| Footer stale | `Verificado el 08/04` |
| Footer expiring | `Termina hoy` / `Termina mañana` / `Termina en 2 días` |
| CTA | `Ver →` |
| Zero-price tope | `Es gratis` / `Pagás uno, llevás dos` |

---

## 2. FilterBar

**Role**: inline chip-based multi-select above the PromoList. Sticky on mobile.

### Visual anatomy

```
┌──────────────────────────────────────────────────────────┐
│ Billetera                                                │
│ [MODO ✓] [Mercado Pago ✓] [Cuenta DNI] [Ualá] [+3]       │
│                                                          │
│ Rubro                                                    │
│ [Todos] [Super] [Farmacia] [Gastro] [Combustible] [+2]   │
│                                                          │
│ Día                                                      │
│ [Hoy ✓] [Mañana] [Esta semana] [Miércoles] [Viernes]     │
└──────────────────────────────────────────────────────────┘
```

### Structure

- Three stacked filter groups: Billetera, Rubro, Día.
- Each group has a label (`--text-xs` weight 500 `--color-text-muted`, sentence case: "Billetera" not "BILLETERA") and a chip row.
- Gap between groups: `--space-4` (16px).
- Gap between label and chip row: `--space-2` (8px).
- Chip row gap: `--space-2` (8px).

### Chip variants

- **Default (inactive)**: `--color-surface` fill, 1px `--color-border` outline, `--color-text-secondary` ink, `--text-sm` weight 500. `--radius-pill`. Padding: 8px horizontal, 6px vertical. Min height: 36px.
- **Active (selected)**: `--color-accent-soft` fill, 1px `--color-accent` outline, `--color-accent` ink, weight 600. Optional `✓` icon 12px on the LEFT of the label.
- **Hover**: border `--color-border-strong`; on active chips, no change.
- **Focus**: `--shadow-focus` ring, 2px offset.

### Mobile overflow

Chip rows scroll horizontally on overflow. A subtle right-edge gradient fade (`linear-gradient(to right, transparent, --color-bg 16px)`) hints at scrollability. No scroll arrows, no custom scrollbar.

### Active-filter indicator

Above the PromoList (not inside FilterBar), a single-line sentence:

```
Mostrando 18 de 97 · [Limpiar filtros]
```

Typography: `--text-sm` weight 500 `--color-text-muted`. The "Limpiar filtros" is a button-styled link: `--text-sm` weight 500 `--color-accent`, underline on hover. Only renders when at least one non-default filter is active.

### Sticky behavior

- Mobile: FilterBar sticks to the top of the viewport once the user scrolls past the page title. Background: `--color-bg` with backdrop blur 12px and a 1px bottom border `--color-border`.
- Desktop (≥1024): non-sticky, scrolls with page content.

### Committed filters = URL

Every chip toggle commits to URL via `router.push`. Preserve the `startTransition` pattern so Next.js SSR re-renders without a jarring flash.

### Microcopy

- Labels: `Billetera`, `Rubro`, `Día`. Single words.
- Day options: `Hoy`, `Mañana`, `Esta semana`, `Lunes`, `Martes`, `Miércoles`, `Jueves`, `Viernes`, `Sábado`, `Domingo`. Never "L M X J V S D" abbreviations — they're opaque in Spanish.
- Rubro options: `Supermercado`, `Farmacia`, `Gastronomía`, `Indumentaria`, `Combustible`, `Servicios`, `Hogar`, `Tecnología`. Keep the category labels from `CATEGORY_LABELS` constant.
- Billetera labels: as defined in `WALLET_LABELS`.
- Reset: `Limpiar filtros` (never "Resetear" — anglicism).

---

## 3. OnboardingSheet

**Role**: first-visit, skippable, warm bottom sheet.

### Visual anatomy

```
┌──────────────────────────────────────┐
│                                      │ ← backdrop rgba(20,17,12,0.32)
│                                      │
│                                      │
│  ┌────────────────────────────────┐  │
│  │                              × │  │
│  │  ¿Qué billeteras tenés?        │  │
│  │                                │  │
│  │  Marcá las tuyas y te          │  │
│  │  mostramos primero las promos  │  │
│  │  que podés usar.               │  │
│  │                                │  │
│  │  [MODO] [Mercado Pago]         │  │
│  │  [Cuenta DNI] [Ualá]           │  │
│  │  [Naranja X] [Personal Pay]    │  │
│  │  [Brubank]                     │  │
│  │                                │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │       Guardar            │  │  │
│  │  └──────────────────────────┘  │  │
│  │       Ahora no                 │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### Sheet container

- Mobile: full-width, bottom-anchored, `--radius-lg` on top corners only (`border-radius: 16px 16px 0 0`). Enters with translateY(100%)→0, 320ms `--ease-out`. Backdrop fades simultaneously.
- Desktop: centered floating, max-width 440px, `--radius-lg` all corners. Enters with scale 0.96→1 + opacity 0→1 over 220ms.
- Background: `--color-surface` (pure white).
- Shadow: `--shadow-3`.
- Padding: `--space-5` (24px).
- Close button (×): top-right, 32×32 tap target, Lucide `X` icon 16px, `--color-text-muted`.

### Content

- **Title**: `¿Qué billeteras tenés?` — `--text-lg` (20px) weight 600 `--color-text-primary`. Margin-bottom `--space-1`.
- **Subtitle**: `Marcá las tuyas y te mostramos primero las promos que podés usar.` — `--text-sm` weight 500 `--color-text-secondary`. Margin-bottom `--space-5`.
- **Wallet chips**: flex-wrap, `--space-2` gap. Each chip 44px min-height (touch-friendly), pill shape. Default and active states identical to FilterBar chips.
- **Primary CTA**: `Guardar` — full-width button, `--radius-sm` (6px), `--color-accent` fill, white ink, `--text-base` weight 600, padding 12px vertical. Disabled state: 40% opacity, unchanged cursor. Margin-top `--space-5`.
- **Secondary link**: `Ahora no` — centered, underline-on-hover, `--text-sm` weight 500 `--color-text-muted`. Margin-top `--space-3`.

### States

- **Initial render**: sheet hidden (opacity 0, translateY 100%). On page mount: 600ms delay, then animate in.
- **Chip selected**: multi-select, no auto-close.
- **Guardar tap**: save to localStorage + push URL param + close sheet over 220ms translateY(0→100%) + opacity 1→0.
- **Ahora no / × / backdrop tap / Esc key**: mark onboarded, close without saving selections.

### Tone

The sheet is **an offer, not a gate**. The product is visible behind it. Dismissing is always one clear tap away.

---

## 4. PromoDetail page layout

**Role**: single focus; the "I won" moment lives here.

### Structure (top → bottom)

```
[NavBar]
← Volver al listado

┌──────────────────────────────────────┐
│  Supermercado                        │  ← category label, --text-xs muted
│                                      │
│  Carrefour                           │  ← merchant, --text-xl weight 600
│                                      │
│         $25.000          25%         │  ← tope 2xl 700 savings-strong │ pct xl 600 savings
│         tope máximo      reintegro   │  ← labels --text-xs muted
│                                      │
│  ────────────────────────────────    │  ← 1px divider
│                                      │
│  Válido       Miércoles              │  ← dl row
│  Vigencia     01/04 – 30/04          │
│  Tope         por semana             │
│  Billetera    MODO                   │
│  Compra mín.  $5.000                 │
│  Regiones     CABA, GBA              │
│                                      │
│  ────────────────────────────────    │
│                                      │
│  Bancos adheridos                    │  ← label --text-xs muted
│  [Galicia] [Santander] [BBVA] …      │  ← pills (tappable → /banco/[slug])
│                                      │
│  ────────────────────────────────    │
│                                      │
│  Tarifas particulares (si hay)       │  ← variants if present
│  25%  en carnicería   Hasta $8.000   │
│  15%  en limpieza     Hasta $5.000   │
│                                      │
│  ────────────────────────────────    │
│                                      │
│  Verificado hace 3 días              │  ← --text-xs muted
│  Fuente: modo.com.ar                 │  ← --text-xs muted
│                                      │
│  [ Ir al sitio  ↗ ]                  │  ← primary CTA
└──────────────────────────────────────┘

[Disclaimer in quiet boxed panel below]
```

### The hero

The `$25.000 / 25%` juxtaposition is the **single commitment of visual weight on the page**. Both numbers center-aligned within their halves. Labels directly underneath in `--text-xs` weight 500 `--color-text-muted`: `tope máximo` and `reintegro`.

When the page opens (per direction.md motion spec), the tope number count-ups from `$0` to its final value over 480ms with `--ease-spring`. Sessionstorage-gated: only fires once per promo per session.

For sin-tope promos: the tope slot shows `Sin tope` in `--text-lg` weight 600 `--color-text-primary` (not green — same rule as PromoCard); pct slot becomes the focal point at `--text-2xl`.

For zero-price (100% / 2×1): the entire hero card gets the `--color-zero-bg` tint (consistent with PromoCard variant 1.D), and the pct slot renders at `--text-3xl` weight 700 `--color-zero-ink`.

### Container

- Card: `--color-surface`, `--radius-lg` (16px — softer than list cards because this is the focus), 1px `--color-border`, padding `--space-5`.
- Max width: 720px centered.
- `--shadow-none` by default; the card sits flat on the paper bg.

### Bancos adheridos

Pills link to `/banco/[slug]`. Pill style: same as FilterBar default chip. Up to 6 pills visible inline; if more, render in a wrap.

### CTA

Primary external-link button:
- Full-width on mobile, auto on desktop (right-aligned).
- `--color-accent` fill, white ink, `--text-base` weight 600.
- `--radius-sm` (6px).
- Padding 12px vertical, 24px horizontal.
- Icon: Lucide `ExternalLink` 14px, right of label.
- Label: `Ir al sitio`.
- Hover: `--color-accent-hover` fill.

### Microcopy (voseo)

- dl labels: `Válido`, `Vigencia`, `Tope`, `Billetera`, `Compra mín.`, `Regiones`, `Bancos adheridos`, `Tarifas particulares`.
- CTA: `Ir al sitio`.
- Sin-tope footer note: `Todo tu consumo suma al reintegro — no hay techo declarado.`
- Stale promo warning (>14 days old): below the timestamp, a quiet line: `Esta promo podría haber cambiado. Verificá en la app del banco.` — `--text-xs` weight 500 `--color-warning`.

---

## 5. NavBar

**Role**: global header, wordmark + minimal chrome.

### Dimensions

- Height: 56px mobile, 64px desktop.
- Sticky: `position: sticky; top: 0; z-index: 40`.
- Background: `--color-bg`.
- Border-bottom: 1px `--color-border`.
- Padding: horizontal `--space-4` (mobile) / `--space-6` (desktop).

### Contents (left → right)

- **Wordmark**: `<Link href="/">Descuentos</Link>`. Inter 600 weight, `--text-lg` (20px), `--color-text-primary`, letter-spacing -0.015em. No logo mark.
- Flex spacer.
- **Install PWA pill** (conditional): renders only when `beforeinstallprompt` event has fired AND the user hasn't installed/dismissed.
  - Style: `--color-surface` fill, 1px `--color-border`, `--text-xs` weight 500 `--color-text-secondary`, `--radius-pill`, padding 6px 12px.
  - Icon: Lucide `Download` 12px, left of label. Label: `Instalar app`.
  - Tap → fires the deferred `prompt()`.
  - Dismiss ×: small 14px × button on the right, marks dismissed in localStorage forever.

### States

No hover on the wordmark (aside from slight color shift). No active/pressed state (it's a navigation, not a commitment).

### What NavBar is NOT

- No search bar in v1. (Phase 5.)
- No avatar / profile menu.
- No dark-mode toggle.
- No language switcher.

---

## 6. Bank / Categoria landing page header

**Role**: SEO-optimized landing page top section.

### Structure

```
[NavBar]
← Volver

Promos de Galicia
18 promos activas · ordenadas por tope

[FilterBar]

[PromoList]
```

### Typography

- `Promos de {label}` — `--text-xl` (28px) weight 600 `--color-text-primary`, letter-spacing -0.015em.
- Subtitle: `{N} promos activas · ordenadas por tope` — `--text-sm` weight 500 `--color-text-secondary`. The "ordenadas por tope" clause is our wedge surfacing; keep it.

### Bottom cross-links

Same as current implementation: "Otros bancos" and "Otros rubros" as pill clusters. No change needed beyond applying the new chip style.

### Microcopy

- Title shape: `Promos de Galicia` for banks; `Promos en Supermercado` for categorías (note preposition shift: "de" for entities, "en" for categories).
- Back link: `← Volver`.

---

## 7. Disclaimer footer

**Role**: always present, quiet, legally sufficient.

### Placement

Home page: below PromoList, `--space-7` top margin, 1px top border `--color-border`, padding `--space-5` top.

Detail page: inside a dedicated boxed panel below the main card, `--color-surface-sunken` fill, `--radius-md`, `--space-4` padding.

### Copy

Line 1: `Información referencial. Verificá los términos en la entidad emisora antes de comprar.`

Line 2 (home only): `Datos tomados de fuentes públicas. No estamos afiliados a ningún banco ni billetera.`

Line 3 (detail only, when merchant is named): `No estamos afiliados a {merchant} ni a ninguna de las entidades emisoras. Los términos completos pueden variar o actualizarse sin previo aviso.`

### Typography

- `--text-xs` (12px) weight 500 `--color-text-whisper` (#B4AD9F).
- Line-height 18px (slightly looser than default xs for reading).
- No uppercase. No icons. No "!" or warning imagery.

Per D2: the AR user reads this disclaimer as *honest hedge*, not cover-your-ass, BECAUSE it's compact, inline, and in voseo.

---

## 8. Sin-tope section (home)

**Role**: collapsed group at the bottom of the home list — promos without declared caps.

### Container

- Appears after the main tope-sorted grid.
- `--space-7` top margin.
- Section is NOT a card; it's a flat disclosure surface with a 1px top border `--color-border`, padding `--space-5` top.

### Collapsed state (default)

```
Sin tope declarado · 12                                 ▾
```

- Full-width button. `--text-base` weight 600 `--color-text-primary` + count pill in `--color-text-muted`.
- Right: Lucide `ChevronDown` 16px `--color-text-muted`.
- Hover: `ChevronDown` rotates 180° on expand; color shifts to `--color-text-primary`.
- Tap: expands via `height: auto` transition, 220ms `--ease-in-out`.

### Expanded state

- Chevron flips to `ChevronUp`.
- Below: standard PromoList grid rendering sin-tope cards (variant 1.B).
- Subtle subtitle above the grid: `Estas promos no declaran un tope máximo. Todo tu consumo suma al reintegro.` — `--text-sm` weight 500 `--color-text-secondary`, margin-bottom `--space-4`.

### Philosophy

Sin-tope promos are NOT second-class. The collapse exists because they can't be ranked by tope (no tope to sort), not because they're less valuable. The "todo tu consumo suma" subtitle reframes them as *structurally different, potentially better if your spend is high*.

---

## 9. Loading skeleton for PromoCard

**Role**: visual placeholder while a page is rendering.

### Structure

Same overall dimensions as a real PromoCard. Inside:

- Avatar: 32×32 circle, `--color-surface-sunken` fill.
- Merchant name: 60% width rectangle, 16px tall, `--radius-xs`, `--color-surface-sunken` fill.
- Category label: 35% width rectangle, 12px tall, `--radius-xs`, 4px below merchant.
- Pct slot (right): 48×28 rectangle, `--radius-xs`.
- Tope line: 70% width rectangle, 16px tall, 12px below header.
- Valid days: 45% width rectangle, 14px tall.
- Bank pills: 3 pill-shaped rectangles, varying widths (48px, 60px, 40px).
- Footer: 2 small rectangles, left 40% width, right 20% width.

### Shimmer animation

```css
background: linear-gradient(
  90deg,
  var(--color-surface-sunken) 0%,
  var(--color-surface) 50%,
  var(--color-surface-sunken) 100%
);
background-size: 200% 100%;
animation: shimmer 1800ms linear infinite;

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

Disabled under `prefers-reduced-motion: reduce` — static placeholder blocks only.

### When to render

Practically never in SSR-first Next.js (data arrives with the HTML). Keep this spec for future streaming RSC scenarios and for the filter-commit latency fallback (`aria-busy` + shimmer after >600ms wait).

---

## 10. Empty state

**Role**: "no promos match your filters" / zero-data / no-results on share link.

### The call: **typographic-only with a single spot illustration.**

### Structure

Centered within the list area, `--space-7` vertical padding, max-width 320px.

- **Illustration**: 120×120 SVG, centered. A line-drawing of an empty shopping cart with two small sparse items inside, strokes `--color-text-muted` (#8A8377), stroke-width 2px, no fill. Reused across all empty states; no state-specific illustrations in v1.
- **Headline**: `--text-lg` (20px) weight 600 `--color-text-primary`. Margin-top `--space-4`.
- **Subcopy**: `--text-sm` weight 500 `--color-text-secondary`. Margin-top `--space-2`, line-height 20px.
- **CTA** (when actionable): pill button, secondary style (`--color-surface` fill, 1px `--color-border`, `--color-text-primary` ink). Margin-top `--space-4`.

### Copy variants

| Scenario | Headline | Subcopy | CTA |
|---|---|---|---|
| Filters match nothing | `No hay promos con esos filtros hoy.` | `Probá aflojar alguno y te mostramos más.` | `Limpiar filtros` |
| Zero data (DB empty) | `Estamos refrescando la base.` | `Volvé en un rato — normalmente está listo en minutos.` | (none) |
| 404 promo | `Esta promo no existe.` | `Puede que la hayamos dado de baja porque ya no está vigente.` | `Ver promos` |
| Share-link empty | `Esta combinación no tiene promos hoy.` | `La promo que buscabas puede haber cambiado. Mirá el resto.` | `Ver todas las promos` |

### Microcopy rule

- All subcopy is ≤2 short sentences.
- All CTAs are action-verbs in voseo (`Probá`, `Ver`, `Limpiar`).
- Never apologize. Never say "lo sentimos" / "disculpá" / "oops." The state is informational, not guilty.

---

## Appendix — component inventory across pages

| Page | Components used |
|---|---|
| `/` | NavBar, page header (h1 + subtitle), FilterBar, active-filter line, PromoList (PromoCard ×N), Sin-tope section, Disclaimer footer, OnboardingSheet |
| `/p/[id]` | NavBar, back link, PromoDetail card, Disclaimer footer |
| `/banco/[slug]` | NavBar, back link, landing header, FilterBar, active-filter line, PromoList, Sin-tope section, cross-links, Disclaimer footer |
| `/categorias/[slug]` | identical to `/banco/[slug]` |
| `/not-found` | NavBar, Empty state (404 variant) |

No component exists for a state not listed above. If D4 discovers a state during implementation that isn't spec'd here, flag it — don't improvise.
