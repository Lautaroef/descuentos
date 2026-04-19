# Visual References — Pattern Taxonomy

Evidence-only. No recommendations. A synthesis agent will turn this into a direction in Round 2.

## Apps analyzed

- **Mercado Pago (AR)** — Dominant AR fintech; yellow/blue "Meli" world trust baseline.
- **Mercado Libre (AR)** — Andes design system; defines what "Argentine e-commerce card" looks like.
- **Nubank (LatAm)** — LatAm fintech warmth benchmark; purple-led brand, Gellix typography, interactive brand system.
- **Linear** — The reference for keyboard-first, calm, high-density minimalism with a single accent.
- **Wise** — Public design system (wise.design) with explicit "Promo card" component specs.
- **Stripe** — Dashboard color system, LCH/perceptual palette engineering for accessibility.
- **Monzo (UK)** — Ragged Edge refresh ("warm, friendly, analogue"); hot coral + navy + soft white.
- **Revolut** — Dark-default, pink CTA, color-coded currency surfaces.
- **N26, Starling, Chase** — Cards-over-lists, progressive disclosure, landing stats (referenced via UX Paradise teardown).
- **Cash App** — "Cash App Green," 3D iconography, playful style guide.
- **Too Good To Go** — Sustainability-green (consumer-savings green adjacent), warm illustration language.
- **Rakuten (2023 refresh)** — Cashback deal list cards, hot accent on activated state.
- **Apple Wallet** — iOS-native vocabulary for "this is money"; categorical color per Apple Card pie (Savings = green).
- **Notion** — Light-default calm workspace, generous whitespace, near-monochrome palette.
- **Things** — Extreme typographic restraint, serif accents, pastel category tints.
- **Arc browser** — "Soft gradients, purposeful typography, layout that respects space" (UX Design cc).
- **Ualá (AR)** — Peach + dodger blue + midnight blue; playful illustration; defined by Aerolab.
- **Naranja X (AR)** — Orange-forward, AR credit-card-brand heritage.
- **MODO (AR)** — Paisanos-built bank consortium wallet; Red Hat Display Bold, deep navy + green accents; native Promos tab.
- **Cuenta DNI (AR)** — Banco Provincia; deep institutional blue; utilitarian, not a design benchmark but part of AR literacy.

## Patterns by dimension

### Color

**"Calm and trustworthy" palettes in practice (observed, with approx hex):**

- **Linear** — Indigo `#5E6AD2` as the single accent, on a near-white surface `#FFFFFF` / `#F7F8F8`, text `#08090A`, secondary `#8A8F98`. This is a 5-token palette doing all the work; no gradients, no decoration. In dark mode Linear just inverts: near-black base, same indigo.
- **Stripe (dashboard)** — Ground color `#0A2540` (Downriver), light surface `#F6F9FC` (Black Squeeze), brand accent `#635BFF` (Cornflower Blue). Their public engineering post details rebuilding this palette in CIELAB to keep contrast consistent across hues; they explicitly say "bright, differentiated colors that met accessibility" — hue vibrancy preserved without darkening muddying it.
- **Monzo (2022 Ragged Edge refresh)** — Hot Coral primary (brand-historic), **deep navy**, **soft white** — deliberately reframed as "warmth, empathy, human quality." Secondary palette expanded but navy is the quiet weight behind the coral.
- **Notion** — Near-monochrome greys on white, faint block-background tints (rose, yellow, blue, green) only when users manually apply; no chromatic accents by default. Signals "calm workspace" through near-absence of color.
- **Arc** — Soft gradients (multi-hue pastels), purposeful use of colored spaces per profile; not monochrome but never saturated against data.

**Light-mode finance palette (observed):**

- Mercado Libre's product surface is essentially `#FFFFFF` with the signature `#FFE600` yellow used as a large tonal panel (hero banners, top bars) — not as accent, but as territory. MP's fintech surfaces sit on top with `#009EE3`-style blue (approx) as their accent.
- MODO renders its account cards on a white list surface with a thin border, each card internally tinted by the partner bank's color (Galicia red, Santander red, BBVA blue) — bank logos act as identity, not heavy brand skins.
- Wise uses near-white surfaces `#F9F9F9`-ish with sharp `#9FE870` (Wise Green) as the single flagship accent. Promo card component docs show it with soft pastel illustration backgrounds inside a 12-16px radius surface.
- Nubank, despite iconic purple, uses a generous white surface in-app; the deep purple `#820AD1` is the identity color on cards and headers, not the base of the screen.

**How "savings" is signaled chromatically (the green question):**

- **Apple Wallet / Apple Card** — Green `#34C759`-ish is specifically tied to "remaining balance this period / on-time payment / savings APY" — used sparingly, always paired with a secondary colored slice (blue = posted balance). Green carries a specific semantic weight, not decorative.
- **Cash App** — An earned-money green `#00D64F`-ish saturates the entire brand. They are outliers: green is their primary, not their status color, which works because their product *is* sending money, not a financial dashboard.
- **Stripe dashboard** — Success/positive is a distinct perceptually-equivalent green within the LCH palette, always paired with an icon or dot to avoid color-only signaling.
- **Wise** — Wise Green on positive deltas, Wise Pink on errors; a single primary-positive mapping.
- **Revolut** — Greens signal positive transactions on its dark surface but color-coding is noisy there (currency colors + transaction colors); not a restraint benchmark.
- **Too Good To Go** — Full brand green `#00857D`-style; sustainability-coded rather than savings-coded, but the emotional register (feel-good, eco) overlaps with "I won back some value."

Observation: across restrained fintech, "savings earned" green is **a narrow tonal window (roughly `#22C55E` to `#00B86B`), used on small surfaces** — badges, deltas, numerals — rather than as a background field. The dangerous zone is pairing green with red loss indicators and making the screen feel like a P&L dashboard; most calm finance apps keep red strictly for errors/alerts, not for "bad money."

**AR-specific trust colors:**

- Mercado Pago blue-cyan `#00A3E0`-adjacent + Meli yellow `#FFE600` is the single most saturated "trust + hustle" pairing in the country. Consumers encode these two as "online money that works."
- Cuenta DNI is a heavy `#004B87`-ish Banco Provincia blue — institutional, old-bank heritage; locals read it as "government-adjacent, state-backed."
- Naranja X's orange `#FF6900`-adjacent is heritage credit-card branding (Tarjeta Naranja, since 1985) — "everyday consumer credit," warm but functional.
- Ualá's peach `#FF6766` + dodger blue `#3E6BFD` + midnight `#18294F` — deliberately designed (Aerolab) to avoid institutional bank cues.
- MODO's palette is deep navy + accent green, with bank-specific colored slivers on account cards. It reads "modern but neutral."

The local trust vocabulary centers on: saturated primaries (not pastels), clean white surfaces, and one strong brand color doing the emotional work. Argentine consumers do not read soft pastel palettes as "finance"; those register as wellness or beauty brands.

### Typography

**Serif vs sans in 2026 fintech:**
Sans dominates. Every bank/fintech in this set uses a modern grotesque or geometric sans. Observed families:
- **Mercado Pago / Mercado Libre** — Proxima Nova historically (MeLi's "Galano"-ish custom cuts also appear in public cases). Rounded, friendly geometric sans; a distinctly Latin-warm grotesque.
- **Nubank** — "Gellix" (custom), specifically chosen for character warmth; their brand book has a "Type Tester" tool.
- **Monzo (2022)** — Oldschool Grotesk as hero typeface + Monzo Sans (custom cut of Universal Sans) as UI. "Generous dots and curled ends" — a deliberate warmth cue.
- **Linear** — Inter + Inter Display; strict hierarchy through weight/size only, no decorative type.
- **Stripe** — Sohne-adjacent stack; numerals are tabular.
- **Wise** — Inter in their public design system examples.
- **MODO** — Red Hat Display Bold for headlines (geometric, slightly warm), body in a humanist sans.
- **Ualá** — Custom sans, rounded, friendly — consistent with the Aerolab case study.

Serifs only appear as editorial accents (Things app uses a subtle serif for empty states / quotes; Wirecutter-style buyer guides lean into editorial serifs for authority). No consumer fintech in this set uses a body serif.

**Type scale (observed):**

Linear-style: 12, 13, 14, 16, 20, 24 with heavy reliance on 13-14 for everything; headings get size only occasionally, weight does most of the hierarchy.

Mobile fintech (MP, Nubank, Wise, MODO): 14-16px body, 20-24px for primary numbers (balance, amount), 32-48px for hero balance/amount on a dedicated screen. Currency symbols often visually downsized (55-70% of the digit size) so the digits read as the figure.

**Bold usage:**
- Linear: "Hierarchy through weight (500, 600) and opacity. Headings are size-first; never use color for hierarchy."
- Monzo / Nubank / MODO: numbers are bold, labels are regular. Bold is reserved for the value, not the framing copy. This is the dominant pattern in consumer finance.
- MP marketing uses heavy weight on CTAs and numbers; subtitles stay regular.
- Notion: bold is rare; subtlety maintained via size and grey steps.

### Whitespace / density

**Spacing rhythms on mobile list views:**

- Linear's public design-pattern documentation specifies a **4px unit** and tight, flat grids with 1px borders instead of gaps or shadows between data surfaces.
- Wise's Promo card sits within a ~16px page margin, 12-16px internal padding; card rows vertically stacked with ~12px gaps on mobile, carousel on desktop.
- Monzo's 2022 refresh uses exaggerated padding on buttons and hero elements in marketing; in-app it still runs dense (transaction rows ~56-64px tall, icon + 2 lines of text).
- Mercado Libre list items on mobile are ~80-96px tall with image + 3 text lines + price — a high-density ecommerce row, closer to Amazon than to a fintech ledger.

**Card padding conventions:**
12-16px is standard for "data cards" (transactions, list items). 20-24px is standard for "promo cards" (Wise, MP marketing tiles, MODO promo tiles). Hero balance cards get 24-32px.

**Section break treatments:**

Linear: 1px border lines between flush-tiled metric cells; no shadows, no rounded outer corners on data panels. "Rounded corners are ONLY for interactive elements (buttons, pills, inputs) and floating overlays."

Monzo/Nubank/MODO: sections separated by large vertical whitespace (32-40px) and pale section headers; cards themselves get rounded corners (12-16px radius).

Notion: whitespace as the only separator — no lines, no shadows, no borders on most blocks.

This is an active split in the field: the "Linear school" (flat, sharp edges on data, borders over shadows) and the "fintech consumer school" (rounded cards, generous whitespace between them).

### Motion

**Common idioms:**
- **Fade + subtle translate-Y (4-8px)** on screen transitions and card entrances — universal.
- **Scale 0.97→1** on tap with a brief opacity bump — iOS-native; adopted by MP, MODO, Nubank.
- **Slide-from-right detail panels** (300ms, cubic-bezier `(0.16, 1, 0.3, 1)`) — Linear's documented choice; common across modern web apps.
- **Skeleton shimmer** over loading spinners — Monzo, Nubank, Revolut all use skeleton rows; Linear avoids spinners entirely ("optimistic updates").

**Durations and easing:**
- Linear's documented standard: **~200ms, ease-out**. Micro-interactions only; "be gentle."
- Material 3 guidance (referenced as the baseline many apps inherit): "snappy take-offs, very soft landings." Durations 150-500ms; easing is decelerate-heavy.
- Primotech's 2026 UI/UX write-up cites **200-500ms** as the "noticeable but doesn't break flow" window for micro-interactions.

**The "savings earned" moment — what competitors actually do:**

- **Cash App** — A number count-up animation (from 0 to the cashback amount) with subtle green glow behind the figure; no confetti, no system-wide celebration.
- **Apple Wallet (Savings)** — On new interest accrual, the daily balance subtly ticks up with an understated animation; the celebratory register is near-zero — trust is expressed through restraint.
- **Honey / Rakuten** — Historically loud: coin particles, "You just saved $X!" toast with a dollar-sign burst. Modern refreshes (Rakuten 2023) have softened this toward a number reveal inside a card.
- **Monzo** — Transactions appear at the top of the list with a gentle slide-down; no celebration per transaction. Reward moments (e.g., round-up pot) get a subtle "+£X" badge animation on the pot icon.
- **Too Good To Go** — Post-purchase screen shows a saved-CO2 counter that counts up; understated, paired with illustration.

Peter Ramsey's UX Planet analysis (Sept 2025) is explicit: **confetti on generic milestones reads as tone-deaf in "serious" categories** (banking, healthcare). Celebrations work when (1) tied to the user's actual goal completion, (2) inline with the value (a delta, a count-up), (3) proportional — "confetti is optional; meaning is not."

Calm-benchmark fintech (Wise, Monzo, Apple Wallet) treats "you saved" as a typographic event rather than a motion event: the number is the hero; motion is a count-up or a 200ms fade-in.

### Iconography

**Outline vs filled dominant approaches:**
- **Linear, Stripe, Notion, Arc, Wise** — outline/stroke icons at 1.5-1.75px weight, monochromatic.
- **Mercado Pago, Nubank, MODO** — mixed: filled icons for primary navigation (bottom tab bar, main actions), outline for secondary/list items. MP bottom tab icons are filled when active, outline when inactive — a near-universal mobile pattern.
- **Cash App** — Dimensional 3D rendered icons in their 2025 brand refresh; the outlier in this set. Creative Bloq notes the 3D icons "make style guides fun."

**Where illustrations appear:**
- **Empty states**: every app in this set uses a spot illustration for "no transactions yet," "no promos today," etc. Nubank built a documented illustration system specifically for this. Ualá's empty states use custom illustrated characters.
- **Hero moments**: Wise uses soft flat illustrations on Promo cards (e.g., "stocks" card has a rendered chart illustration). MP uses photographic lifestyle imagery for promotions. MODO uses Lottie animations (confirmed by Paisanos case study) for the send/request/pay flows.
- **Onboarding**: Nubank, Monzo, and Ualá all use sequenced illustration+headline onboarding screens.

### Card design

**The promo card dissected across references:**

1. **Wise promo card (from public design system):**
   - Left-aligned stack: illustration (top-right or left, optional), then **title (bold, 2 lines max)**, then **supporting text (regular, grey)**, optional CTA pill at the bottom.
   - Dynamic text handling: card grows vertically; images never overtake text (explicitly documented).
   - Carousel format allowed *only if* all cards have the same height.
   - Whole card is tappable; optional icon accessory.

2. **MODO promo row (Paisanos case study screenshots):**
   - Horizontal card: brand avatar (circular, left), title + subtitle stacked, trailing amount/percentage or chevron.
   - Bottom nav has a dedicated "Promos" tab with its own icon — signals promotions are a top-level destination, not a shelf.

3. **Mercado Pago promo tile (marketing surface):**
   - Large image hero (60% of card height) with brand logo overlaid, then percentage badge ("20% OFF") on a colored pill, merchant name, and cap/condition in small type.
   - Key detail: the **percentage badge is typographically larger than the merchant name** — the saving is the lede.

4. **Rakuten deal card (2023 visuals):**
   - Merchant logo (rounded square, left), merchant name bold, cashback rate as a pill right-aligned ("10% Cash Back"), tiny "was 5%" above if elevated. The "elevated" state uses brand purple; the standard state is near-monochrome.

5. **Too Good To Go "magic bag" card:**
   - Hero photo of the restaurant/shop (half the card), then merchant name, distance, rating, pickup window, and **strikethrough original price + new price** right-aligned. The price comparison is the emotional hit; distance answers the practical question.

**Information hierarchy inside a promo card (synthesized from the 5 above):**
The discount/cap value is always the largest textual element after the brand mark. Merchant name is weight-bold at body size. Conditions (cap, expiry, requirements) sit in a secondary grey at 12-13px. Trailing CTAs are either chevron affordances or a pill button, rarely both.

**How multiple-promo lists avoid feeling like a dump:**
- **Grouping** — Section headers by category (Gastronomía, Supermercados) with subtle grey subheads. MP, Rakuten, and Honey all do this.
- **Visual rhythm** — Cards alternate orientations (horizontal row for standard, wider hero card for featured) to break monotony. MP's home uses ~1 featured card per 4-6 rows.
- **"Best for you" featured shelf** — a horizontally-scrolling carousel at the top of a category anchors attention on a curated 3-5.
- **Dense, flat list with tight internal padding** — Linear-style; Wise's account transactions page is this pattern: no visual weight between rows, just 1px dividers, fast to scan.

### Money presentation

**Currency/percent typography:**
- **Ualá, MP, MODO** — Amount is hero-size (28-48px depending on context), currency symbol is smaller (~60-70% of digit height) and set in the same weight. In Argentina the sign is `$` used for both ARS and USD; disambiguation relies on context, not glyph variation.
- **Wise's "Expressive Money Input"** — Currency symbol sits inline left, amount scales dynamically as digits grow; the whole input is the hero on its screen.
- **Revolut** — Currency code (ARS, USD, EUR) next to the figure in small caps; each currency has its own tonal background across account cards.

**Spanish-AR/LatAm number formatting:**
- **Decimal comma, thousands period**: `$25.000,50` not `$25,000.50`. This is codified (RIUSS; fastspring locale guide) and used by every AR-facing fintech in this set. Any product shipping to AR audiences must format this way; US formatting reads as a foreign/exported product immediately.
- Thousands period on integers is often omitted in display (`$25.000` is read correctly). Cents are often hidden when `,00` — MP and MODO both do this.

**How "$25.000" is made hero vs restrained:**
- **Hero context** (promo detail, confirmation screen): 36-48px, weight 700-800, sitting alone on a white surface with a thin currency label above. The entire screen defers to the number.
- **In-list context** (promo card): 18-22px, weight 600, paired with a percentage pill. The number shares space with merchant + conditions; it's the largest text but doesn't dominate.
- **As a badge** (discount pill): percentage gets the larger weight; the monetary cap sits as a secondary "tope $X" under it.

**"You saved $X" moments:**
- Cash App and Honey use a count-up to the amount with a brief green halo/glow.
- Apple Wallet shows `+$X.XX` in green below the primary balance; no motion beyond the tick.
- Rakuten shows a running "Lifetime Cash Back: $XXX" in the profile — the accumulation is the emotional register, not any single moment.
- Built For Mars' teardown argues the "meaning" moment (e.g., "when your card is ready to use") beats arbitrary celebration moments every time.

### Trust signals

**Verified / updated badges — placement and restraint:**
- **Mercado Libre/Pago** — "MercadoLíder" badge on seller cards (small, colored pill near merchant name). "Última actualización: hace X horas" appears in a muted secondary line on status/tracking screens, not on main list cards.
- **MODO** — Bank attribution is strong and explicit (Galicia/Santander badges on account cards) — the trust signal *is* the partner bank.
- **Apple Wallet** — Verified partners get the Wallet badge; trust signal is structural (Apple vouches for it) rather than applied per-listing.
- **Wise** — "Regulated by FCA" type attribution lives in account settings, not on transactions; day-to-day trust comes from the consistency of the design system itself.

**Source attribution patterns:**
In aggregators/review apps (Wirecutter, TGTG), the source/last-update timestamp is always a small grey 12px line **below** the price/detail, never next to it. It's a reassurance, not a headline.

### "I won" emotional moment — deep patterns

**1. Apple Wallet / Apple Card "daily cash" register:**
No burst, no toast. The daily cash line on the card's back quietly increments each day. The emotional payoff comes from checking back and *seeing* the accumulation. Pattern: **trust through typographic consistency + time-as-a-multiplier**.

**2. Monzo's "Pot" round-up system:**
A small "+£0.53" badge animates onto the pot icon after each transaction, and the pot's visual (a small glass/jar illustration) subtly fills. Micro-moment, not a screen takeover. Pattern: **persistent ambient reward** — you see progress in the background of doing other things.

**3. Honey/Rakuten checkout win:**
Historically: a full-screen modal with coin confetti and "You just saved $27!" in huge type with a bouncing dollar-sign icon. Current refreshes have dialed this back to a card-sized confirmation with a subtle particle effect and a CTA to "view your total savings." Pattern: **loud historically, trending toward restraint** — the delight has migrated from animation into numerical framing.

Takeaway: the "calm" benchmark apps favor **persistent, ambient, typographic reward** over punctuated celebration. Loud celebration belongs to apps where the win is discrete (checkout, gamified milestones) — not ongoing browsing.

### Filter / navigation

**Mobile patterns observed:**
- **Bottom tab bar (4-5 items)** — MP, MODO, Nubank, Monzo, Revolut, Cash App. The universal shell for consumer finance. MODO specifically gives "Promos" its own tab.
- **Segmented control at top** for binary/ternary splits — Apple Wallet's tabs (Cards / Recent), Revolut's tabs within a currency.
- **Chip filters (horizontal scroll)** — the dominant pattern for "filter by category" on discount/deal apps. Rakuten, Groupon, TGTG, MP Promos all use this. Typically 6-10 chips, the first being "All / Todos."
- **Bottom sheets** — iOS 16+ native sheets for secondary actions (filters, sort, detail). Wise and Mobbin's bottom-sheet documentation emphasize they're for "supplementary content" — don't put primary flows in them.
- **Drawer/hamburger** — essentially dead in modern fintech. Nothing in this set uses it as primary nav.

**Sort affordances:**
- Small "Ordenar por" text button top-right of a list, opening a bottom sheet with radio options. MP, MODO, Rakuten.
- Linear's pattern: inline dropdown in the list header, no sheet.

**Filter-active indicators:**
- A small dot/counter on the filter icon ("Filtros (3)") — universal.
- Active filter chips stay visible above the list, removable with an × — MP, Rakuten, Airbnb-style.
- Linear's filter-toggle pattern (documented): border color shifts to accent on active; no background fill. Border does the work.

### Whitespace and density, cont. — promo-list-specific observations

- **Rakuten** lists are dense (4-5 cards per screen on a mid-size phone), using 72-80px card heights, 12px vertical gap. The density signals "many options, browse fast."
- **Wise**, by contrast, runs lower density (2-3 promo cards per screen) with generous whitespace — signals "this is a recommendation for you."
- **MP Promos** splits the difference: a featured carousel (1 large card visible) at the top, then dense list (~5 rows visible) below.

A deal-hunting app sits in the Rakuten zone when the value is browsing volume; it sits in the Wise zone when the value is editorial curation. Both are defensible.

## AR-specific visual language

Observed visual cues that register as "locally Argentine" without cliché:

- **Bold primary colors, not pastels** — MP yellow, MODO navy-green, Ualá peach-blue, Naranja X orange, Cuenta DNI institutional blue. Pastels in finance read as "foreign wellness app" to AR users. Brand saturation is the baseline.
- **White surfaces as the default**, not off-whites or dark. Cuenta DNI, MP, Ualá, MODO, Naranja X all default to white. Dark mode is secondary or absent.
- **Casual, personal microcopy** — `Enviá`, `Pagá`, `Pedí` (voseo imperatives) on MODO and MP. Formal `Enviar` reads as corporate/distant. The conjugation itself is a trust signal for AR readers.
- **Merchant logos rendered at roughly equal visual weight regardless of size** — Mercado Libre's product listings feature tiny supplier logos and massive national-retailer logos at the same card size; flat visual parity is part of the "everyone has a shop here" cultural signal.
- **Typography with slightly rounded terminals** — Proxima Nova (MP/MeLi), Gellix (Nubank), Red Hat Display (MODO), Aerolab's Ualá sans. Nothing as geometrically cold as Futura; nothing as humanist as Georgia. The sweet spot is warm-geometric.
- **Dense information cards** — Argentine ecommerce/fintech users are used to seeing a lot per screen (MercadoLibre product card density is legendary). Over-whitespaced layouts can read as "empty / under-built."
- **Amount formatting with decimal comma and thousand period** is non-negotiable. `$25.000` with a period.

Things that make a design feel "exported from US fintech":
- Over-rounded corners (>20px) on everything.
- Pastel mint+lavender palettes.
- Uppercase button labels (US SaaS habit).
- Dollar-sign formatting `$25,000.00`.
- English-style casing ("Send Money" vs "Enviar plata").
- Over-use of emoji-style 3D illustrations (Cash App works because it's a brand identity; transplanted onto an AR app, it reads wrong).

## Anti-patterns observed

- **Dark-mode cyberpunk finance dashboards** — Revolut-style neon purples and pinks on near-black read as crypto/trading, not everyday savings. The user's brief explicitly steered away from this.
- **Confetti on every success** — per Peter Ramsey's UX Planet analysis, confetti on generic milestones in serious-category apps (banking, savings) reads as tone-deaf. Delight without context is "contradiction, not delight."
- **Over-nesting (card-within-card-within-card)** — Linear's documented #1 mistake. Data surfaces should be flat with border separation; nesting creates visual noise.
- **Using shadows on data surfaces** — again Linear's explicit rule: shadows only for floating overlays (modals, dropdowns), never on tables/cards/panels in the flat list plane.
- **Rounded corners on every element, including data rows** — breaks the "sharp edges on data, rounded on interactive elements" rhythm that top calm-fintech systems preserve.
- **Color-only status signaling** — red/green deltas without icons or text fail accessibility and add visual heat without comprehension. Wise and Stripe explicitly pair color with icons/dots.
- **Percentage alone without the peso cap** — AR users care about the `tope`; showing "20% OFF" without "hasta $25.000" is a usability miss because the cap is often the binding constraint.
- **Uppercase body copy / buttons** — reads as shouty US-style SaaS.
- **Animating everything** — micro-interactions 200-300ms on *some* elements create rhythm; animating every hover/scroll becomes noise.
- **Generic pastel mint "banking" palettes** — reads as exported US fintech to AR users; pair with decimal-point currency formatting and it's a double tell.
- **Drawer/hamburger primary navigation** — retired by every app in this set.

## References (sources)

- Linear brand palette — https://mobbin.com/colors/brand/linear
- Linear design-pattern documentation (third-party codification) — https://lobehub.com/skills/marcus-marcus-skills-linear-design-patterns
- Stripe's "Designing accessible color systems" (LCH, perceptually-uniform palette engineering) — https://stripe.com/blog/accessible-color-systems
- Nubank "A Nu way of guidance: Meet the Nu Brand System" — https://building.nubank.com/nu-brand-system/
- Nubank illustration system — https://www.behance.net/gallery/226297413/Nubank-Illustration-system
- Monzo 2022 rebrand (It's Nice That / Ragged Edge) — https://www.itsnicethat.com/news/ragged-edge-monzo-graphic-design-021122
- "Banking app design: 10 great patterns and examples" (UX Paradise / Victor Conesa) — https://medium.com/uxparadise/banking-app-design-10-great-patterns-and-examples-de761af4b216
- Wise Design System — Promo card — https://wise.design/components/promo-card
- Wise Design System — Expressive Money Input — https://wise.design/components/expressive-money-input
- Ualá case study (Aerolab, Buenos Aires) — https://aerolab.co/uala
- MODO case study (Paisanos) — https://www.paisanos.io/projects/modo-product-case-study
- Mercado Libre scaling design across Latin America (Figma) — https://www.figma.com/customers/mercado-libre-scales-design-across-latin-america/
- Andes UI (Mercado Libre) on Dribbble — https://dribbble.com/shots/5513459-Andes-UI-User-Interface-System-por-Mercado-Libre
- Mercado Pago visual guidelines (Behance) — https://www.behance.net/gallery/70133691/Mercado-Pago-Visual-guidelines
- Mercado Pago yellow-world branding case — https://veobrandingcompany.com/our-work/mercado-pago/
- Cash App brand guidelines (Creative Bloq) — https://www.creativebloq.com/design/branding/cash-apps-new-brand-guidelines-make-style-guides-fun
- "Why Confetti Celebrations Backfire" (Peter Ramsey, UX Planet, Sept 2025) — https://uxplanet.org/why-confetti-celebrations-backfire-and-how-to-make-them-work-be838a6e7b8b
- Material 3 motion, easing and duration — https://m3.material.io/styles/motion/easing-and-duration
- "UI/UX Evolution 2026: Micro-Interactions & Motion" (Primotech) — https://primotech.com/ui-ux-evolution-2026-why-micro-interactions-and-motion-matter-more-than-ever/
- Spanish numerical notation (decimal comma, thousand period) — https://riuss.org/numerical-notation
- Currency formatting guide (fastspring) — https://fastspring.com/blog/how-to-format-30-currencies-from-countries-all-over-the-world/
- Mobbin bottom sheet glossary — https://mobbin.com/glossary/bottom-sheet
- Arc Browser design analysis — https://medium.com/design-bootcamp/arc-browser-rethinking-the-web-through-a-designers-lens-f3922ef2133e
- "Top 15 Banking Apps with Exceptional UX Design (2026)" — https://www.wavespace.agency/blog/banking-app-ux
- Too Good To Go redesign case studies — https://uxplanet.org/revitalizing-too-good-to-go-app-a-ux-design-case-study-48c3bfab90a5 ; https://medium.com/@janasachse/app-redesign-too-good-to-go-3603eafb4cd3
- Rakuten redesign case study — https://rizalazhare10.medium.com/redesign-rakuten-mobile-apps-ux-case-study-1ee8dba08ccc
- Apple Wallet HIG — https://developer.apple.com/design/human-interface-guidelines/wallet
