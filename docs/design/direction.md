# Design Direction — Descuentos AR

> D3 synthesis. The single source of truth for the visual and tonal redesign.
> Written for D4 to implement without clarifying questions.

---

## Mood sentence

**"Un lugar tranquilo donde mirás qué te conviene hoy y te vas sintiendo que jugaste bien tu mano."**

English gloss: *a calm place where you check what's worth buying today and walk away feeling you played your hand well.*

The register is **unhurried, confident, locally-built**. Never shouty, never celebratory. The product is a poker odds table, not a slot machine. Every visual choice defers to the numbers.

---

## Vibe anchors

Five references, each informing a specific decision:

1. **Mercado Pago** — **local trust baseline.** White surface, saturated primaries, voseo register, `$` with period thousands. We inherit the AR visual literacy of "this is serious money software" without importing MP yellow. Microcopy tone is our ceiling for warmth: informal-friendly, never slangy.
2. **Things 3** — **typographic restraint.** Delight lives in the negative space and the weight of a single number. No decoration earns its keep; every pixel either carries information or breathes. This is our density model for the mobile list.
3. **Apple Wallet** — **"money as object" dignity.** A promo is a thing the user *owns-for-today*, not a banner ad. Each PromoCard carries presence — a single color-field, a single hero number, and nothing decorative. The "I won" feeling comes from the card's *weight on the screen*, not from motion.
4. **Linear** — **flat-data discipline.** Sharp edges on data surfaces, borders over shadows, 200ms ease-out motion, a single accent color doing all the work. This is the anti-decoration rulebook.
5. **MODO** — **the local-finance corner case we must not look like.** MODO is our partner's aesthetic (deep navy, green accent, Red Hat Display Bold). We deliberately distance ourselves: warmer off-white background, green accent that sits differently, humanist sans. When a user has both apps open, ours should feel like a sibling, not a clone.

Honorable mentions: **Wise** informs our PromoCard internal hierarchy (percent as lede, merchant bold, conditions grey). **Monzo 2022** informs the "warm not cold" typography choice.

---

## Brand voice

### Spanish-AR register rules

- **Voseo is mandatory, always.** Never `tú`, never `usted`, never the Spain-imperative (`elige`, `selecciona`). Always `elegí`, `seleccioná`, `fijate`, `tocá`, `pagá`, `llevate`, `activá`.
- **Enclitic accent rule:** voseo imperatives with unstressed enclitics do NOT take an accent. `Fijate` (not `fijáte`), `llevate` (not `lleváte`), `sumate` (not `sumáte`). But `Contame`, `Probá` keep their form. QA every string.
- **Informal-respectful, never colloquial.** Forbidden: *che*, *boludo*, *posta*, *banca*, *re zarpado*. Allowed and encouraged: short sentences, contractions (*pa'* is still too much; *para* stays), second-person verbs.
- **No Porteño-only slang.** Córdoba and Rosario users are in scope. *Laburo*, *guita*, *mango* are regional enough to avoid in UI chrome. Reserved for very occasional copy moments (never in nav, never in errors).
- **Gender-neutral when trivially possible**, sidestep when not. *Tus compras*, *tu cuenta*, *te conviene* — all neutral-by-phrasing. We do not use *todes* / *@* / *x* — too polarizing for a broad AR audience.
- **"Pesos" vs "$":** `$` in list chrome, numbers, and compact surfaces. *Pesos* spelled out in narrative copy ("ahorrás 5.000 pesos este mes") when warmth matters.
- **Numbers are ES-AR formatted always.** `$25.000` not `$25,000`. Drop cents for integer pesos (`$25.000`, not `$25.000,00`). Use `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })`.
- **No uppercase button labels.** "Ir al sitio", not "IR AL SITIO".

### Microcopy bible

Canonical strings D4 must use verbatim. Any deviation needs review.

| Surface | String | Notes |
|---|---|---|
| Home title | `Descuentos` | Wordmark only — no tagline on the page, the tagline is in `<title>` |
| Home subtitle | `Hoy te conviene…` | Replaces current "Promos ordenadas por tope". `Hoy` is the operative word — the user is always in "what wins today" mode. |
| Home tope header | `Con tope` | Section label for the ranked list. Singular, direct. |
| Home sin-tope header | `Sin tope declarado · {N}` | Collapsed by default. "Declarado" (not "definido") because it matches how users talk in r/DescuentosArgentina. |
| Freshness pill | `Verificado hace {relative}` | Always visible. Colon not used — `hace` reads as natural Spanish. |
| Freshness stale | `Verificado el {date}` | Switch to absolute when > 7 days. Builds trust per D2. |
| Tope cap line | `Hasta $25.000 {por mes / por semana / por día}` | `Hasta` not `Tope` — conversational. Period is appended. |
| Tope cap line (no cap) | `Sin tope` | Two words, not "Sin tope de reintegro" — brevity wins. |
| Expiring today banner | `Termina hoy` | Never `Apurate`, never `Últimas horas`. No anxiety. |
| Expiring ≤3 days | `Termina en {N} días` | Same tone. |
| Share-link toast | `Te compartieron esta promo` | Inbound link context. |
| Empty state (filters) | `No hay promos con esos filtros hoy. Aflojá alguno y probá de nuevo.` | *Aflojá* — conversational verb, voseo. |
| Empty state (zero data) | `Estamos refrescando la base. Volvé en un rato.` | Only shown if DB returns zero across the board. |
| Error state | `Algo se trabó. Probá recargar.` | Conversational failure; never "Ha ocurrido un error". |
| Onboarding title | `¿Qué billeteras tenés?` | `Tenés` not `usás` — captures identity ("what you carry"), not habit. |
| Onboarding subtitle | `Marcá las tuyas y te mostramos primero las promos que podés usar.` | Explicit payoff; promises value before asking for input. |
| Onboarding skip | `Ahora no` | Not "Saltar" / "Skip" — conversational dismissal. |
| Onboarding submit | `Guardar` | Single word. |
| Bank detail CTA | `Ir al sitio` | Never "Ir al sitio del banco" — redundant in context. |
| Disclaimer | `Información referencial. Verificá los términos en la entidad emisora antes de comprar.` | Per D2: voseo, non-defensive, matches user's own mental model. |
| Disclaimer home footer | `Datos tomados de fuentes públicas. No estamos afiliados a ningún banco ni billetera.` | Paired with main disclaimer in home footer. |
| Sin-tope pitch (detail) | `Esta promo no declara tope. Todo tu consumo suma al reintegro.` | Explains *why* sin-tope is special, not second-class. |
| Zero-price badge | `100%` or `2×1` | Literal. Gets its own visual treatment (see PromoCard spec). |
| "Won" language — forbidden | ~~"¡Ganaste!"~~, ~~"¡Ahorraste!"~~, ~~"¡Aprovechá!"~~ | No app-side victory claims. The user's win is private. |
| Verified source note | `Fuente: {source_name} · {date}` | Detail page. Specific like the D2 r/DescuentosArgentina pattern. |

---

## Palette decision

### The call: saturated, not pastel

**Pastels are rejected.** D1 flagged this as a synthesis call and the evidence is unambiguous: every successful AR fintech (MP, MODO, Ualá, Naranja X, Cuenta DNI, Brubank) runs saturated brand colors on clean white. AR users read pastel-mint palettes as "exported US fintech / wellness app" — a trust degradation we cannot afford on day one. The user's brief says "calmer colors, more white-ish" — we honor that through *surface* (warm off-white + white elevation, no neon, no dark mode) while keeping one saturated accent doing identity work.

### Tokens

Colors use OKLCH where Tailwind v4 allows, hex for legacy interop.

```
/* Surfaces — warm-neutral, never cool grey */
--color-bg:              #FBF9F5;   /* warm off-white; "paper" not "sterile" */
--color-surface:         #FFFFFF;   /* card fill; sits above bg */
--color-surface-raised:  #FFFFFF;   /* modals, sheets; elevation via shadow */
--color-surface-sunken:  #F3EFE7;   /* sin-tope section, disabled chips */

/* Text — warm near-black, not pure #000 */
--color-text-primary:    #14110C;   /* warm ink; reads as "bookish" not "chrome" */
--color-text-secondary:  #5A544B;   /* body muted */
--color-text-muted:      #8A8377;   /* supporting labels */
--color-text-whisper:    #B4AD9F;   /* legal / timestamps */

/* Borders & dividers */
--color-border:          #E8E2D5;   /* warm hairline; 1px is enough */
--color-border-strong:   #D3CCBE;   /* interactive hover ring, focus */
--color-divider:         #EEE8DB;   /* internal card rules */

/* Brand accent — the single identity color */
--color-accent:          #1F7A5A;   /* "pampa green" — muted, confident, local.
                                        Sits between Wise Green and a banknote green.
                                        Distinct from MODO's brighter green. */
--color-accent-hover:    #186347;
--color-accent-soft:     #E3F0EA;   /* 8% tint for subtle fills */
--color-accent-ink:      #FFFFFF;   /* text on accent */

/* Semantic — scarce, purpose-built */
--color-savings:         #1F7A5A;   /* SAME as accent. Savings IS the brand. */
--color-savings-strong:  #135C42;   /* hero tope numbers on white — AA+ contrast */
--color-warning:         #B45309;   /* "termina hoy" — warm amber, never red */
--color-warning-soft:    #FDF3E4;
--color-error:           #9F1239;   /* reserved for load failures; never promo states */
--color-error-soft:      #FBE7EC;

/* Zero-price treatment — 2×1, 100% — categorical difference */
--color-zero-ink:        #14110C;   /* reads near-black */
--color-zero-bg:         #FFF3B8;   /* warm sunlight yellow — one nod to MP-world
                                        trust without *being* MP yellow */
```

### Rationale for "pampa green"

- **Semantic precision.** Every "save" / "reintegro" / "tope" surface uses ONE color. The user reads green once and knows it means "this is the money you're reclaiming." No splitting "brand" and "savings" into two greens.
- **Local fit.** A muted deep green reads as "billete, banco, cosecha" in AR — it's closer to a Banco Nación green than to a Silicon Valley mint. MODO owns a brighter green (`~#1EE88C`-style on dark); ours is earthier and lives on off-white, which distances us.
- **Accessible on warm white.** `#1F7A5A` on `#FBF9F5` tests at 5.6:1 contrast (AA for normal text). `#135C42` for large hero numbers tests at 7.8:1 (AAA).
- **Two-tier system, no more.** Primary = accent = savings. Warning amber is the only second chromatic. Everything else is neutral warm greys. D1 warned: "pairing green with red loss indicators makes the screen feel like a P&L dashboard." We don't have red on the main plane; errors live off the promo surface.

### Rationale for warm off-white background

- `#FBF9F5` reads as **paper**, not **UI canvas**. Warmth signals "trustworthy / curated / human-made" per D1's Monzo-refresh analysis. Pure `#FFFFFF` everywhere reads sterile in a commerce context and flattens the elevation hierarchy (white card on white bg is invisible; white card on warm bg floats).
- Argentine apps default to white, so we stay in that neighborhood but nudge 2-3% warmer. Not enough that a user notices on first load; enough that side-by-side with MP/MODO our app feels less corporate.
- This answers the user's "white-ish not dark" directly while keeping enough contrast for cards.

### Dark mode

**Not in scope for v1.** User explicitly said lighter. D1 noted dark-mode-with-neon reads "crypto-risky" in AR. Revisit if/when users request it post-launch; structure tokens in CSS vars so a theme swap is a future-proof possibility, not a feature.

---

## Type system

### Chosen family: **Inter**

Primary: `Inter` (variable font, self-hosted via `next/font/google`).
Fallback chain: `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`.

### Why Inter, not DM Sans / Plus Jakarta / Figtree / Geist

- **Best-tested humanist-grotesque in the world.** Used by Linear, Wise, GitHub, Mozilla, Figma. Pedigree matters because we inherit calm-fintech literacy without the cost of bespoke type.
- **Tabular numerals out of the box.** `font-feature-settings: "tnum"` gives aligned digit columns on PromoCard — essential when tope numbers stack in a list and eyes scan the column.
- **Variable weight (100-900) via one file** — we get exact weight tuning (500, 550, 600, 700) without shipping multiple weights. Payload is ~70KB woff2.
- **SS03 and CV11 OpenType features** already supported — single-story `a`, slashed zero — gives us subtle character without paying for Gellix or Aeonik.
- **Spanish diacritic quality is excellent.** Inter handles `ñ`, `á`, voseo stressed forms cleanly. (DM Sans drops accent balance on `í`; Geist is too geometric for warmth.)
- **Free and self-hostable** under SIL OFL. No licensing cost, no runtime CDN dependency.

Runner-up considered: **Plus Jakarta Sans** — slightly warmer, but tabular numerals less mature and diacritics drift. Rejected because numerical alignment is load-bearing for us.

Runner-up considered: **Geist** — too cold-geometric for a consumer app; reads "dev tool," not "money software for people."

### Loading strategy

Self-host via `next/font/google` in `src/app/layout.tsx`:

```ts
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});
```

Apply `${inter.variable}` to `<html>`. No Google Fonts CDN at runtime; Next self-hosts.

### Type scale — 6 steps

Based on a 1.200 minor-third ratio, anchored at 16px body. Line-height scales loose → tight with size (readability at 16, air at 12).

| Token | Size | Line-height | Weight default | Letter-spacing | Use |
|---|---|---|---|---|---|
| `--text-xs`   | 12px | 16px | 500 | +0.01em | timestamps, disclaimer, chip labels, legal |
| `--text-sm`   | 14px | 20px | 500 | 0      | body supporting, dd labels, secondary rows |
| `--text-base` | 16px | 24px | 500 | 0      | body primary, merchant names, card titles |
| `--text-lg`   | 20px | 28px | 600 | -0.01em | section headers, promo detail secondary hero |
| `--text-xl`   | 28px | 34px | 600 | -0.015em | page titles (home, bank detail header) |
| `--text-2xl`  | 40px | 44px | 700 | -0.02em | hero tope number on detail page |
| `--text-3xl`  | 56px | 60px | 700 | -0.025em | reserved for "zero-price" hero card (2×1, 100% off) |

Weights used:
- `400` — never for body, reserved for weakly-emphasized inline moments
- `500` — default body (warmer feel than 400 on Inter at small sizes)
- `600` — section headers, merchant names, card hero pct
- `700` — hero tope numbers only

Tabular numerals **always on** for anything rendering a peso amount, percent, or date:
```css
font-variant-numeric: tabular-nums;
font-feature-settings: "tnum" 1, "cv11" 1, "ss03" 1;
```

### Hierarchy rule

Per Linear: **hierarchy through weight + size, never through color.** The green accent is semantic (savings), never decorative. A 600-weight 20px title reads as "section header" without needing to be green. A 700-weight 40px tope number reads as "the answer" without needing a background color.

---

## Spacing scale

### Base unit: 4px. Scale: 8 steps.

```
--space-0:  0
--space-1:  4px   /* tight internal padding, icon-to-text gap */
--space-2:  8px   /* chip gap, form-inline gap */
--space-3:  12px  /* card internal row gap, dense list gap */
--space-4:  16px  /* default card padding, form field gap */
--space-5:  24px  /* section vertical gap, card outer gap */
--space-6:  32px  /* page section break */
--space-7:  48px  /* hero block vertical rhythm */
--space-8:  64px  /* page-level major break (rare) */
```

Mapped to Tailwind v4 as `spacing-{0..8}` through `@theme` config. Never use arbitrary `p-[13px]` in components. Never use `p-0.5` / `p-1.5` / `p-2.5` — those fractional steps are banned from the system (force the 4px rhythm).

### Page-level grid

- Mobile (<640px): 16px side gutters.
- Tablet (640-1024): 24px gutters.
- Desktop (>1024): max-width 1120px content, centered, 32px gutters.

The home list is **1 column on mobile, 2 on tablet (≥640), 3 on desktop (≥1024)**. Gap between cards: `--space-3` (12px) — dense enough to signal "many options," airy enough to scan.

---

## Corner radius — philosophy & tokens

### The call: **Linear-style sharp-data / rounded-interactive**

D1 flagged this as a synthesis call with two defensible camps. Choice: **sharp-data, rounded-interactive.**

Rationale:
- PromoCard is a **data surface** in our mental model — it's a row in a ranked list, not a marketing tile. A 16px rounded card competes for visual weight with the tope number inside it; flatter corners defer to content.
- The AR user's mental reference point is MercadoLibre product cards, which have a moderate radius (8-12px) but feel dense and functional. Over-rounding reads as "exported US fintech."
- Interactive affordances (buttons, chips, inputs, the skip onboarding link) *should* feel tactile and pressable — those earn full pill / rounded treatment.
- Simpler implementation rule for D4: if you tap it and it responds, round it more. If it's a container of information, round it less.

### Tokens

```
--radius-none: 0
--radius-xs:   4px    /* small inline badges, timestamps */
--radius-sm:   6px    /* inputs, select, small buttons */
--radius-md:   10px   /* PromoCard, detail card, sections — "data containers" */
--radius-lg:   16px   /* bottom sheets, modals, hero detail card */
--radius-xl:   24px   /* PWA install prompt, major onboarding moments (rare) */
--radius-pill: 9999px /* chips, filter pills, avatar rings */
```

PromoCard uses `--radius-md` (10px). Not 16px (too soft) and not 0 (too cold). Chips are pills. CTAs are `--radius-sm`. Never mix arbitrary radii on the same component surface.

---

## Elevation

### Low-key. Borders first. Shadows rarely.

Linear rule adopted: **shadows only on floating overlays (modals, sheets, dropdowns)**. Data surfaces (PromoCard, detail card, section headers) use a 1px warm border — `--color-border`.

### Tokens

```
--shadow-none: none
--shadow-1:    0 1px 2px 0 rgba(30, 24, 15, 0.04)              /* barely-there; hover card */
--shadow-2:    0 4px 16px -4px rgba(30, 24, 15, 0.08)          /* dropdown, popover */
--shadow-3:    0 12px 32px -8px rgba(30, 24, 15, 0.12)         /* bottom sheet, modal */
--shadow-focus: 0 0 0 3px rgba(31, 122, 90, 0.20)               /* focus ring — accent at 20% */
```

PromoCard: no shadow default. Border only. On hover: shadow-1 + border shifts to `--color-border-strong`. This is the Linear pattern — subtle lift without activating the "is this clickable?" crisis.

OnboardingSheet and PromoDetail hero card get shadow-3.

---

## Motion

### Philosophy

Motion is a **rhythm instrument, not an attention-grabber**. Duration bands:
- 120-160ms — quick (tap feedback, chip toggles, hover)
- 200-240ms — default (list reorder, card enter, toast)
- 280-340ms — settle (sheet enter/exit, detail navigation)
- 420-520ms — savings count-up (reserved, typographic only)

### Tokens

```
--duration-quick:   150ms
--duration-default: 220ms
--duration-settle:  320ms
--duration-countup: 480ms

/* Easing — three curves only */
--ease-out:      cubic-bezier(0.22, 1, 0.36, 1)     /* the workhorse; deceleration */
--ease-in-out:   cubic-bezier(0.65, 0, 0.35, 1)     /* for transforms with origin */
--ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1)  /* reserved for count-up only */
```

### When to animate

| Action | Motion | Duration / easing |
|---|---|---|
| Chip tap | scale 0.97→1, opacity 0.85→1 | quick / ease-out |
| PromoCard hover | border color shift + shadow fade-in | quick / ease-out |
| PromoCard tap | scale 0.99→1 | quick / ease-out |
| List filter commit | fade 0→1 + translateY(4px→0) | default / ease-out |
| Bottom sheet enter | translateY(100%→0) + backdrop fade | settle / ease-out |
| Detail page nav | fade + translateY(8px→0) | default / ease-out |
| "Sin tope" expand | height auto + content fade | default / ease-in-out |
| Savings count-up | numerical interpolate 0→N | countup / ease-spring |
| Skeleton shimmer | background-position loop | 1800ms / linear |
| Freshness pill tick | no animation — static | — |

### When to NOT animate

- Never fade opacity on text that's already visible (causes re-read flicker).
- No animation on detail-page initial render beyond the default page transition.
- No hover animation on touch devices (use `@media (hover: hover)`).
- No parallax. No carousels on the main list. No "scroll reveal" as you scroll the home feed.
- Respect `prefers-reduced-motion: reduce`: all non-essential motion drops to 0ms, only opacity fades remain for layout-correctness.

### The savings count-up — the "felt win" moment

This is the **single ceremonial animation in the app**. Spec:

**Trigger:** When a user opens a PromoDetail page whose `tope >= 5000` AR pesos OR whose `pct >= 20` (the D2 "felt win" threshold). Triggered once per session per promo.

**Behavior:**
- The hero `tope` number (40px, weight 700, savings-strong green) renders initially at `$0`.
- Over **480ms**, interpolate from `0` to final value using `--ease-spring`.
- Simultaneously, the `pct` chip above fades in from opacity 0 to 1 over 220ms (offset +40ms delayed start).
- Numbers use `Intl.NumberFormat('es-AR')` at every frame — no glitchy intermediate formatting.
- No glow, no halo, no particle effect, no sound. The animation IS the entire celebration.

**Anti-rules:**
- Never count-up on list cards — only on detail view.
- Never count-up on return visits to the same promo (stored in sessionStorage keyed by promo id).
- Never count-up for sin-tope promos (there's no number to anchor) — instead fade-in the `100%` or `Sin tope` badge over 320ms.

Per D2/D1: the "I won" moment is typographic, not decorative. A number resolving into view is the whole emotion.

### Tap targets

All interactive elements: minimum 44×44 CSS px per iOS HIG. PromoCard has a 44px minimum effective tap height anywhere inside it.

---

## Imagery

### Merchant logos: **yes, when available, render flat.**

D2 is clear: "Argentine users respond to 'I recognize this supermarket' more than to stylized iconography." Merchant logos are a trust signal.

- Ingestion does not currently fetch logos (Phase 2 artifact; Phase 4+ work). For now: render a **first-letter avatar** — merchant initial on a `--color-surface-sunken` disc, 32px diameter, `--text-base` weight 600 in `--color-text-secondary`.
- When logos are available (future field `merchant_logo_url`), render at 32×32 inside `--radius-sm` container, `object-fit: contain`, no drop-shadow.
- Bank badges on PromoCard: monochrome text pills (current impl). Do NOT add bank logos even when available — visual noise and trademark risk.

### Illustrations: **minimal, and only in specific places.**

- **Empty state (no promos match filters)**: a single 120px spot illustration. Spec: *line-drawing of an empty shopping cart with two sparse grocery items, drawn in warm-neutral strokes (2px, `--color-text-muted`), no fill.* D4 can source from Lucide or commission a single SVG. One illustration total, reused across all empty states on v1.
- **Onboarding sheet**: no illustration. The question is the star.
- **PromoDetail**: no illustration. The number is the star.
- **No 3D icons.** No Cash-App-style rendered dimensionality. That's a brand-identity move we have not earned.
- **No stock photography.** No handshake, no shopping bags, no asado, no maté. All stock is lethal to trust.

### Iconography

**Lucide only.** Already in the project (`lucide-react`). Stroke weight `1.75`. 16px default in body, 14px in chips, 20px in page titles. Monochromatic, always `currentColor`. Never fill icons except for the zero-price star (see PromoCard zero-price variant).

---

## Information hierarchy rules

Ranked loudest → quietest. When in doubt, move something down this list.

### Loud (hero)

- **Tope number** (`$25.000`) on PromoDetail — `--text-2xl`, weight 700, `--color-savings-strong`.
- **Pct** (`25%`) on PromoCard — `--text-xl`, weight 600, `--color-savings`.

### Medium (title)

- **Merchant name** on PromoCard — `--text-base`, weight 600, `--color-text-primary`.
- **Page titles** (home, bank detail) — `--text-xl`, weight 600.

### Quiet (supporting)

- Category label, tope cap line, valid days — `--text-sm`, weight 500, `--color-text-secondary`.
- Bank pills — `--text-xs`, weight 500, `--color-text-muted` on `--color-surface-sunken`.

### Whisper (reassurance / legal)

- `Verificado hace...` timestamp — `--text-xs`, weight 500, `--color-text-muted`.
- Disclaimer — `--text-xs`, weight 400, `--color-text-whisper`.
- Source attribution — `--text-xs`, weight 500, `--color-text-muted`.

### Rule: the tope is the hero

No decision that downplays tope can ship. If a PromoCard puts pct visually above tope (as the current impl does), that's a regression. Tope answers "how much can I actually reclaim" — pct is the rate.

**Exception: sin-tope promos.** When `tope === null`, pct moves up to hero position by default because there's no cap to rank. See PromoCard variants in `components.md`.

### Rule: freshness always visible

Per D2: "Absolute timestamps outperform relative ones for trust; freshness-claim inflation erodes trust quickly; missing timestamps are often read as 'probably stale'." Decision: **relative for ≤ 7 days, absolute for > 7 days.** Example: `Verificado hace 2 días` (fresh) vs `Verificado el 08/04` (stale). The threshold flip itself signals "we're being honest that this is older."

### Rule: zero-price promos look categorically different

Per D2 (Shampanier/Mazar/Ariely): "100% reintegro" and "2×1" trigger a qualitatively different affective mode. Design decision:

- Zero-price detection: `pct === 100` OR `promo_type === '2x1'` OR `pct === 50 AND promo_type === 'bonificado'`.
- Treatment: PromoCard gets a **yellow tint fill** (`--color-zero-bg`) instead of white surface. The pct value renders at `--text-3xl` weight 700. Category label and merchant name sit unchanged. The tint is the whole categorical shift — no star, no "Free!" badge, no decoration. Yellow is the D2 "zero-price" glow reference.
- On the detail page: same treatment — the entire hero card gets the yellow tint fill; everything else unchanged.

---

## Open decisions resolved (recap)

These were flagged by D1/D2 as needing synthesis judgment. Each resolved here:

1. **Pastel vs saturated palette** → **saturated**, via the "pampa green" accent on warm off-white. Distinct from MP yellow, MODO green, Ualá peach.
2. **Font licensing** → **Inter (free, self-hosted via Next font loader)**. Best tabular numerals + Spanish diacritic quality + pedigree.
3. **Motion system** → 3 duration tokens + 3 easing curves; savings count-up is the only ceremonial animation, everything else is 150-220ms ease-out.
4. **Felt-win threshold** → `tope >= 5000 ARS OR pct >= 20%` triggers the count-up animation on detail view. Threshold is in code, not UI-visible. Below threshold the number just renders static.
5. **Primary surface shape** → **ranked list with "Hoy te conviene…" implicit hero.** Not top-1, not top-3. The top card of the sorted list IS the hero; subsequent cards are runners-up. User can scroll for more without a paradox-of-choice modal step.
6. **Gamification cap** → **monthly running total only, opt-in, ambient**. No streaks, no "you missed 3 promos" push. See `ia.md` for placement (under onboarding block on home, collapsed until user opts in).
7. **Per-promo freshness** → **always visible**. D2 evidence was unambiguous.
8. **Corner philosophy** → **sharp-data (10px cards) / rounded-interactive (6px buttons, pill chips).**

---

## Summary: the two things D4 must never compromise

1. **The tope number is the hero.** Every visual tradeoff bends away from that only when explicitly spec'd (sin-tope variant, zero-price variant).
2. **Typographic restraint delivers the "win."** No confetti, no screen-takeovers, no celebratory toast, no emoji hero. The single moment of motion in the app is the count-up on detail open — and even that is a number resolving into place, not a victory lap.
