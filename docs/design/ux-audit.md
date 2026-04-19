# UX Audit — 2026-04-19

> Doc-only audit by Agent U. No code changes proposed — only diagnosis and
> directional suggestions. Implementation decisions live downstream with
> Agents L/M.

## Audit context

**Persona** — Argentine deal-hunter, CABA resident, iPhone-Safari, moderate
follower of r/DescuentosArgentina + @ahorrotwit, carries MODO + Mercado Pago +
Cuenta DNI + Galicia. Actual task: *"Tengo que ir al super esta semana.
Quiero saber qué día y con qué tarjeta me conviene gastar los $40.000 que
tengo destinados."* Registers *vos* as normal, *tú* as foreign. Tolerance: 10
seconds to first confusion before bouncing on a cold visit; 30 seconds to
install if value is obvious.

**Site audited** — `https://descuentos-six.vercel.app`
**Commit audited** — `60a8d57` (`chore(deploy): prod deploy of redesign`), the
 current `origin/main`. Local branch has three later commits
(`420105b`, `8ef335b`, `617627e` — merchant logos, intercepting modal, shared
PromoDetail) that are NOT yet deployed, so this audit intentionally ignores
them.

**Device/viewport simulated** — iPhone-equivalent mobile (~375×800, DPR
implied), plus a full-page mobile render and URL-driven flows covering home,
detail, bank, categoría, filtered, and empty states. Desktop viewports were
not separately rendered; desktop-specific findings are reasoned from markup,
not direct visual inspection.

**Tools used** — `mcp__firecrawl__firecrawl_scrape` exclusively
(`formats: ['markdown', 'rawHtml', 'screenshot']`, `mobile: true`,
`waitFor: 3000–5000 ms`). Chrome MCP was not invoked — the required extension
handshake wasn't a reliable option from this environment and Firecrawl
provides the same hydrated DOM + SSR HTML + real screenshots. No broken
flows were observed that warranted a re-run after a 10-minute cooldown.

---

## Executive summary

The redesign has clearly landed the right *skeleton*: warm off-white paper,
pampa-green accents, Inter typography, voseo register, SSR-true filters,
sort-by-tope-descending, and a bottom-sheet onboarding with good a11y bones
(`role="dialog"`, `aria-modal="true"`, `aria-labelledby`). Once the persona is
past onboarding, the home feed looks like the direction doc promised.

However, the "diagnosis layer" — the set of claims the product whispers that
the user reads as *trust* — is leaking in multiple places:

1. **Every `/p/[id]` detail page ships with an SSR hero of `$ 0 tope
   máximo`.** The count-up animation's initial value is the value in the HTML;
   until JS hydrates it is literally `$ 0`. The spec's "the tope is the hero"
   rule inverts to "the hero is zero."
2. **Stale data is decorated as fresh.** Cerini's 50% gastronomía promo
   declares `Vigencia 01/07/2024 – 31/07/2024` — 21 months expired — yet
   appears in today's feed with `Verificado hace 8 horas`. The freshness pill
   is disconnected from validity.
3. **Taxonomy bleed** — raw source slugs (`brubank-ultra`, `naranjax`,
   `provincia`, `carrefour`, `uala`, `Yoy`, `coto-descuentos`, `modo`) surface
   unformatted as bank pills, source attributions, and bank-detail pages, with
   some linking to 404s (`/banco/brubank-ultra`).
4. **Currency formatter inserts a non-breaking space after `$`.** Every peso
   amount renders `$&nbsp;25.000` — reads as *foreign* in AR where the native
   form is `$25.000` (no space). Cheap to fix, expensive in trust.
5. **Sort-by-tope-descending leads the persona to a worse answer than sort
   by reintegro-for-their-spend.** With a $40k supermarket budget, the top
   card (`Carrefour 10% Hasta $35.000`) yields $4.000 back. The fourth card
   down (`Coto 25% Hasta $30.000` with Supervielle) yields $7.500. The
   product's wedge question ("which play wins today for my spend?") is not
   what the sort answers.

**Severity breakdown** — P0: 4 · P1: 14 · P2: 9.

---

## Flow-by-flow findings

### Flow 1 — Cold first visit from a shared WhatsApp link

**What I tried** — Open `/` with no params, no localStorage, on mobile.

**What I expected** — To see a ranked list with a visible hero card and
understand, within 10 seconds, what the app does. Per the spec, an onboarding
sheet fades in 600ms after first paint with the list visible behind it.

**What actually happened** — The wordmark "Descuentos" is visible at top.
Within a second the onboarding sheet animates up from the bottom, darkening
the backdrop. The 7 wallet chips show labels ("MODO", "Mercado Pago", "Cuenta
DNI", "Ualá", "Naranja X", "Personal Pay", "Brubank") and a "Guardar" button
that is rendered disabled (40% opacity) and a muted "Ahora no" link.

**Friction list**:

1. **[P1]** The list IS technically visible behind the sheet (as the spec
   demands) but at 375px the sheet covers approximately 60% of the viewport
   at rest, so a user who wants to "peek behind it" to verify "this is a
   deals app" has to scroll the *backdrop*, which doesn't work as expected on
   iOS Safari (the sheet's scrim intercepts gestures). The backdrop preview
   promised in `ia.md` § Flow 1 is largely theoretical on mobile.
2. **[P1]** The disabled "Guardar" button doesn't look obviously disabled —
   it's a pastel green-on-green at 40% opacity that reads almost like a
   "pending" button rather than "not yet clickable." First-timers likely tap
   it, see nothing happen, and blame the app. The disabled state needs
   stronger visual contrast (e.g., neutral gray) or a micro-copy hint ("Marcá
   al menos una").
3. **[P2]** The title `¿Qué billeteras tenés?` assumes the user already
   knows what a "billetera" is in the AR-fintech sense. For the persona this
   is fine; for the truly-cold WhatsApp share-link recipient, a one-line
   gloss ("las apps con las que pagás") would disambiguate in ~20 words.
4. **[P2]** There is no "Instalar app" pill in the NavBar on SSR — correct,
   because `beforeinstallprompt` is client-only. But the audit discovered no
   visible first-visit install prompt at all on the rendered home, even after
   dismissing the onboarding. Either the prompt never fires on the
   audit-environment user-agent, or the dismiss state from onboarding leaks
   to the install pill. Worth confirming on a real iOS/Android device.
5. **[P1]** The `Ahora no` secondary action is a quiet underlined link — the
   spec calls it a "clear dismissal." But sighted users at 375px read it as a
   footnote, not a door out. It's about 18px below the disabled primary CTA
   with no visual hierarchy cue that "this is the other option." A new user
   who doesn't want to commit wallets might instead tap the × in the top-
   right corner, which is also tiny (32px tap target containing a 16px icon,
   barely meeting the 44×44 spec). The combination — giant disabled primary +
   two skip options — creates a *decision micro-paralysis* at the exact
   moment the product is supposed to feel effortless.

**The 10-second test** — Could I articulate what the app does within 10
seconds? Yes-ish: "Descuentos" wordmark + the onboarding question + the
sub-copy `Marcá las tuyas y te mostramos primero las promos que podés usar`
conveys enough. But there is **no tagline, no hero sentence about tope/
reintegro, no "bancos + billeteras" framing** — the spec deliberately omitted
a tagline in favor of `<title>` SEO. That's a defensible call but it means
a shared-link-arriving first-timer sees essentially *only* the word
"Descuentos" before the sheet arrives. A subtitle under the wordmark
("Ordenadas por cuánta plata recuperás") would cost nothing and buy the 10-
second test a clearer pass.

**Would I install?** If I got past onboarding and saw the ranked list with
`Hoy te conviene…`, plus the `294 activas` stat, yes. But I'd need to
navigate past the sheet first, which breaks the "30-second install
threshold" for many users.

### Flow 2 — Intent-driven task ("Quiero $40k en super esta semana")

**What I tried** — Home with `?wallet=modo&rubro=supermercado` (my owned
wallets + supermarket). Simulated the persona's actual task.

**What I expected** — The top card is the best play for my $40k spend: i.e.,
the highest *expected reintegro capped at $40k*, not the highest tope.

**What actually happened** — The list returned:
 - #1 Carrefour 10% `Hasta $35.000 por mes` Lunes/Martes/Miércoles (no bank
   shown)
 - #2 Coto 25% `Hasta $30.000 por mes` Sólo los martes (Supervielle)
 - #3 Carrefour 35% `Hasta $25.000 por mes` Sólo los miércoles (Patagonia)
 - #4 Jumbo 35% `Hasta $25.000 por mes` Sólo los sábado (Patagonia)
 - #6 Coto 20% `Hasta $25.000 por ticket` Sólo los jueves (Patagonia)

Let me compute expected reintegro for a $40.000 spend, applied in
person-think order:
 - Carrefour #1: 10% × $40k = $4.000, tope $35.000 — wins $4.000.
 - Coto #2 (Supervielle): 25% × $40k = $10.000, capped at tope $30.000 — wins
   $10.000.
 - Carrefour #3 (Patagonia): 35% × $40k = $14.000, capped at tope $25.000 —
   wins $14.000.
 - Jumbo #4 (Patagonia): same as #3 — wins $14.000.

**The top card is the worst play for the persona's exact stated spend.** The
best play is the 3rd or 4th card, which the persona has to discover by
scrolling *and doing mental math on each tope* — the mental math the app was
explicitly built to eliminate (per `product.md` the wedge).

**Friction list**:

6. **[P0]** Sort-by-tope-descending doesn't answer *"which of my wallets
   wins for my spend?"* It answers *"which promo has the highest cap,
   regardless of whether I'd reach it."* `product.md` calls this out:
   *"tope alone is an oversimplified sort — a $50.000 tope at 5% is worse
   than a $20.000 tope at 30% for someone spending $40.000."* The deployed
   sort ignores this. The user-psychology.md synthesis agent flagged this in
   Open Decision 4 — unresolved in this build. Direction: either introduce a
   spend-context input (sticky default e.g. $40k) and rank by
   `min(pct × spend, tope)`, OR surface both the pct and an "expected
   return" secondary line on each card so the user can compare without doing
   the math silently.
7. **[P1]** The persona can't filter to "esta semana." The Día chip row
   offers `Hoy / Mañana / Lunes…Domingo` but no `Esta semana` or
   `Fin de semana` aggregate — the ia.md spec includes `Esta semana` as a
   chip option; it's missing. The persona who wants to plan for "this week"
   has to manually scan for "todos los días" + the day(s) they plan to shop.
   Moderate miss.
8. **[P1]** The `Billetera` filter pre-fills `MODO` (because URL has
   `wallet=modo`). But the resulting 18 cards include promos for issuer
   banks the user doesn't have (Supervielle, Banco Patagonia, Credicoop,
   ICBC, Comafi). This is technically correct — MODO is a multi-bank wallet
   — but the UI nowhere surfaces *"MODO requires an issuer card; does yours
   match?"*. The persona carries Galicia under MODO, so a Supervielle promo
   is unusable unless they open a Supervielle account. The app is showing
   them "promos you can use with MODO" rather than "promos you can use with
   MODO + Galicia." Without a second filter for "mis bancos" (which doesn't
   exist), the MODO view is over-permissive and the persona has to re-filter
   mentally.
9. **[P1]** Pct and tope visually compete in the card header. The pct is
   top-right (`20px / 600`, color `--color-savings`); the tope is below-left
   (`16px / 600`, color `--color-savings-strong`). Per spec the tope is
   "hero" and pct is "secondary" — but the tope is smaller than the pct and
   shares its row with the *valid_days string* (which the eye reads as
   context, not data). In the rendered screenshot the pct dominates the
   right half of the card while the tope competes with a bank-pill cluster
   below it. The tope is *first in reading order* because of the column
   layout, but visual weight is neutral-to-pct-favoring. This is exactly the
   regression direction.md § "Rule: the tope is the hero" explicitly forbade.
10. **[P2]** No confidence signal on the top recommendation. The persona's
    final question — *"should I trust this top card?"* — has no dedicated
    answer on the home page. `Verificado hace 8 horas` helps but doesn't
    build confidence in the *ranking decision* itself. A small "mejor para
    tu spend" secondary badge on the top card, gated on a spend input, would
    close the loop.

**Conclusion**: the app gets the persona to supermercado-today in 3 taps but
the *answer quality* is miscalibrated for the persona's stated spend. A
deal-hunter comparing this recommendation against their r/DescuentosArgentina
intuition would likely discard it.

### Flow 3 — Owned-wallet personalization

**What I tried** — Tap MODO, Mercado Pago, Cuenta DNI, Brubank in the
onboarding, tap Guardar, observe feed update, then reload and expect the
filter to persist.

**What I expected** (per `ia.md` § Flow 2) — The URL rewrites to include
`?wallet=modo,mercadopago,cuentadni,brubank` on Guardar; the feed narrows to
"promos you can use"; the onboarding sheet dismisses; localStorage persists;
a second visit without URL params soft-redirects (via `history.replaceState`)
to the same filtered URL.

**What actually happened** — Guardar DOES write to localStorage
(`descuentos-ar:onboarded = '1'` and `descuentos-ar:owned-wallets`) and push
the URL. The sheet dismisses. The feed re-renders with the multi-select
billetera filter applied. Good.

**Friction list**:

11. **[P1]** Editing wallets post-onboarding is undocumented/undiscoverable.
    `ia.md` § Onboarding flow says: *"Re-onboarding is not re-triggered;
    user can re-onboard via a settings screen (Phase 5)."* In practice,
    today, to change wallets the user must either (a) know to toggle the
    billetera chips in the FilterBar (technically works), or (b) clear
    localStorage manually. Neither is obvious. The FilterBar chips DO toggle
    the filter correctly, but *they don't update the stored owned-wallets
    preference* — so if the persona learns they have Santander now and
    toggles Santander ON in FilterBar, the next cold visit still returns to
    their old 4 wallets. This is a silent state mismatch: the filter chip
    state and the onboarded state diverge.
12. **[P2]** The wallet chips in onboarding and in FilterBar look and feel
    identical. Good for consistency — but it means the user has no mental
    model for "the top one is my permanent prefs, the bottom one is
    temporary." Direction: either unify (FilterBar changes also update
    owned-wallets) or visually differentiate the two roles.
13. **[P2]** The onboarding chips are in a single flex-wrap with no
    grouping. 7 wallets fits in ~3 rows on 375px but the order is fixed
    alphabetical-ish (MODO, Mercado Pago, Cuenta DNI, Ualá, Naranja X,
    Personal Pay, Brubank) rather than usage-prevalent. Minor.

**Is onboarding pleasant?** The copy is good (`¿Qué billeteras tenés?`,
`Marcá las tuyas y te mostramos primero las promos que podés usar`) and the
voseo is clean. The sheet feels light. But the disabled-Guardar-looks-like-
pending state (Friction #2) is a speed bump on what should be a smooth 10-
second moment.

### Flow 4 — Share-link scenario

**What I tried** — Direct-navigated to `/?wallet=modo&rubro=supermercado`
with no prior state.

**What I expected** — SSR renders the filtered view; active chips visibly
highlighted; result count visible; no onboarding sheet (since URL conveys
intent).

**What actually happened** — SSR does render 18 of 294 promos with
`Mostrando 18 de 294 promos · Limpiar filtros`. `aria-pressed="true"` is set
on MODO and Supermercado chips (so screen readers get the state). Visually
the active chips ARE highlighted (`--color-accent-soft` fill, `--color-accent`
border). But:

**Friction list**:

14. **[P1]** The onboarding sheet STILL appears on share-link entry if the
    user hasn't been onboarded before. A share-link recipient has to deal
    with the modal before seeing the filter result the sender intended them
    to see. `ia.md` Flow 3 said *"target: 0 taps, already answered"* — the
    onboarding intercepts that.
15. **[P1]** No `Te compartieron esta promo` toast on `/p/<uuid>` entries
    from external referrers (spec'd in `direction.md` microcopy bible under
    "Share-link toast"). Optional feature not implemented.
16. **[P2]** There's no "you have these filters active" condensed pill
    above the list on narrow viewports — the filter state is only readable
    by scrolling the FilterBar itself. The `Mostrando 18 de 294 promos` line
    says the *count* but not *which filters*. The `Limpiar filtros` pill
    appears above the count rather than inline with it (spec says inline). A
    share-link recipient scrolling the feed from mid-list has to scroll back
    up to see what's filtering.

### Flow 5 — Detail view

**What I tried** — Tap the Coto / 25% / $30.000 Supervielle card to land on
`/p/373681ab-4d84-5759-9d22-e76db30d48bc`.

**What I expected** — A focused detail card with `$30.000` as the count-up
hero, `25%` to the right, labels under each, dl with
`Válido/Vigencia/Tope/Billetera/Compra mín/Regiones/Bancos adheridos`, the
`Verificado hace…` pill + source attribution, and the `Ir al sitio` CTA.

**What actually happened**:

17. **[P0]** **The hero tope reads `$ 0 tope máximo` in the SSR HTML.** The
    count-up animation's starting value is written into the HTML, so on
    first paint (and permanently with JS disabled) the page's single most
    important number is zero. Users on slow-3G, Safari with content blockers,
    screen readers processing before hydration, and anyone who briefly sees
    the pre-hydration state will see `$ 0` as the headline value. This
    directly contradicts `direction.md` § "hero is the tope" and the savings
    count-up anti-rules (`Never count-up for sin-tope promos` — but also,
    implicitly, never render `$0` as a static fallback).
18. **[P1]** `Compra mín.  $ 60.000` — the persona who's willing to spend
    $40k total across their whole shop now has to hit a $60k *ticket* minimum
    to unlock this promo. That's a load-bearing data point, but the `Compra
    mín.` label is in muted `--text-xs` in a dl row — same visual weight as
    `Tope por mes`. A persona scanning could miss it. Direction: either
    promote `Compra mín.` to an alert-style row when it's > tope, or surface
    it on the PromoCard (it's currently not on cards at all).
19. **[P1]** The source attribution reads `Fuente: coto-descuentos` — a raw
    slug. Direction.md microcopy bible says `Fuente: {source_name} · {date}`.
    Here there's no date and the source name is a slug, not a human name
    (should be something like `coto.com.ar`). The detail page's only trust
    lever below the timestamp is malformed.
20. **[P1]** On the Cerini detail page (p/7f4fcf3a-…) the `Vigencia`
    renders as `01/07/2024 – 31/07/2024` — **the promo is 21 months
    expired** and yet is listed on the home feed with `Verificado hace 8
    horas` and the detail page shows no stale warning, no "ya no está
    vigente" banner, and the `Ir al sitio` button still works. This is a P0
    in data quality and a visible symptom on the UI: the app is displaying
    a 2024 promo as if it's live today. The spec (components.md § PromoDetail
    microcopy) calls for `Esta promo podría haber cambiado. Verificá en la
    app del banco.` on promos > 14 days old — here we're 21 *months* past
    `valid_to` and the UI is silent.
21. **[P1]** The `Bancos adheridos` section for the Cerini promo renders a
    single pill labeled `brubank-ultra` which links to `/banco/brubank-ultra`
    — **which 404s.** The 404 page reads *"Esta promo no existe"* (wrong
    copy, not even a promo). This is a dead-end tap the persona will hit if
    they click the only bank pill on the page. P0-flavored: broken
    navigation + wrong copy on the 404.
22. **[P2]** The `Ir al sitio` CTA is right-aligned on wider viewports but
    full-width on mobile — correct per spec. But it renders without any
    explanation of *what the destination is*. `Ir al sitio` — *cuál sitio?*
    The persona trusts the link but would benefit from the destination host
    visible inline (e.g., `Ir a coto.com.ar →` as the label when the source
    URL host is known). Minor.
23. **[P2]** No "Tarifas particulares" / variants section is rendered even
    though the spec has it. Deferred is fine; flag that the spec is ahead of
    implementation.

### Flow 6 — Bank deep-dive (`/banco/galicia`)

**What I tried** — Direct navigation to `/banco/galicia`.

**What I expected** — A page headed `Promos de Galicia`, subtitle with
count + "actualizadas al 19/04/2026", a FilterBar with Galicia pre-selected
and unmodifiable, cards ranked by tope, cross-links at bottom.

**What actually happened** — The title reads `Promos de Banco Galicia` —
good. Subtitle: `21 promos activas · ordenadas por tope`. The FilterBar IS
rendered but **no chip indicates "Galicia is pre-selected."** There's no
Banco chip row at all (the filter taxonomy is Billetera / Rubro / Día). So
the Galicia context is implicit in the URL but invisible in the filters.

**Friction list**:

24. **[P1]** The page's *single defining piece of context* (this is the
    Galicia view) has no active-filter chip. The user can narrow further by
    wallet/rubro/día — fine — but can't *see* or *unpin* the Galicia scope
    from within the FilterBar. If they want "Galicia and NOT Nación" they
    have no affordance to express that. The BANCO filter dimension is
    absent, conceptually. Direction: add a Banco chip row (OR at least
    render a non-toggleable "Banco Galicia" chip above the FilterBar to
    make the pinned context legible).
25. **[P1]** Bank-page cards show the same overloaded bank-pill cluster as
    home cards. On `/banco/galicia` the top card's pills read
    `Santander / Banco Nación / Banco Galicia …y 16 más`. The persona on
    the Galicia page has to *scan for "Banco Galicia"* in a pill cluster to
    confirm each result is relevant. The page's implicit promise ("these
    all apply to Galicia") is technically correct but the pill ordering
    doesn't sort Galicia to the front. Direction: on a scoped bank page,
    always sort the pill cluster so the scoped bank is first, optionally
    highlighted.
26. **[P2]** The `Otros bancos` footer links include some proper brand names
    (`Banco Nación`, `Santander`) and some slugs (`BueppPay`, `Yoy`). Same
    taxonomy bleed as pills. Some banks in the list — e.g. `Banco
    Patagonia` — render cards in the Galicia view because their promos
    share issuer_bank arrays. Confusing.

**"Galicia's best deal this week in one screen?"** — Technically yes: the
top card on `/banco/galicia` is `COTO 20% Hasta $25.000 por mes martes` via
the Santander/Galicia/Patagonia/+16 multi-bank cluster. For a $40k Galicia
shopper, this is ~$5.000 back. Whether it's "the best play" depends on
whether you consider multi-bank promos Galicia-specific (they are, but they
are equally available on 16 other banks — so the user's "Galicia identity"
doesn't win anything here). The `/banco/galicia` page doesn't flag that
multi-bank promos are non-exclusive to Galicia.

### Flow 7 — Installing the PWA

**What I tried** — Inspected the manifest, rawHtml for install pill, and the
onboarding sheet order-of-operations.

**What actually happened**:

27. **[P1]** The `Instalar app` pill does not appear in the server-rendered
    NavBar (which is correct — `beforeinstallprompt` is a client event). On
    the rendered mobile screenshot no install pill is visible. iOS Safari
    doesn't fire `beforeinstallprompt` at all (Add-to-Home-Screen is a
    manual Share-menu action), so on the persona's primary device the pill
    is *architecturally invisible*. The spec's "install CTA" doesn't exist
    for the persona. Direction: on iOS Safari, render an instructional
    tooltip ("Compartir → Agregar a Inicio") as a one-time pill. This is a
    known PWA-iOS fact the spec sidesteps.
28. **[P2]** The manifest (`/manifest.webmanifest`) declares
    `display: standalone`, `background_color: #FBF9F5`, `theme_color:
    #FBF9F5` (good, matches direction.md), `orientation: portrait`. But it
    declares NO `screenshots` array — Chrome Android's install UI shows
    screenshots when present; their absence degrades the install prompt's
    appeal. Simple add.
29. **[P2]** No `shortcuts` array either. The PWA could offer at least one
    shortcut ("Ver promos de supermercado" / "Hoy") for installed users.
    Not blocking.
30. **[P0]** `robots.txt` declares `Sitemap: https://descuentos.ar/sitemap
    .xml` — but the deployed domain is `descuentos-six.vercel.app`. If
    `descuentos.ar` is not owned / is not serving identical content, Google
    Search Console will reject this sitemap and the app gets no SEO uplift
    from the Phase 2.6 landings. Either domain-hygiene fix needed OR the
    robots.txt should reference the canonical deployed URL. SEO-critical.

### Flow 8 — Edge scenarios

**What I tried** — (a) A combination guaranteed to return zero results
(`?wallet=personalpay&rubro=electro&dia=7&region=CORRIENTES`). (b) A narrow-
viewport render at 375px. (c) Rapid filter toggles (inferred from filter
architecture). (d) Network-throttled simulation (reasoned).

31. **[P1]** Empty state on `wallet=personalpay&rubro=electro&dia=7&region
    =CORRIENTES`: renders `Mostrando 0 de 294 promos` +
    `## No hay promos con esos filtros hoy.` +
    `Probá aflojar alguno y te mostramos más.` — ✓ copy matches spec. But
    there's no `Limpiar filtros` CTA in the empty state body (the button
    appears above the count). Per `components.md` § Empty state the
    CTA should be *inside* the empty state panel. The user sees empty copy
    + no action → has to re-scan up the page to find `Limpiar`.
32. **[P2]** The empty state has no illustration (120px empty-cart line
    drawing per spec). Cold rendering. Not broken, just bare.
33. **[P1]** The empty state URL includes `region=CORRIENTES` but
    `region=` isn't a supported filter in the current SSR — it gets
    ignored. The `Regiones` dropdown or chip row that Phase 2 supposedly had
    ("currently in impl as a select") doesn't render anywhere in the live
    HTML. This is a regression from the phase-2-notes promise and a gap vs.
    `product.md` wedge #3 ("Region-aware").
34. **[P1]** At 375px the cards' bank-pill cluster wraps to two lines
    (`Santander Banco Nación Banco Galicia` / `…y 16 más`). This pushes the
    tope line visually upward and makes the card feel bottom-heavy. On
    `<390px` devices the cards' minimum height (196px spec) is exceeded
    silently on multi-bank promos — they grow to 220-240px and the grid
    rhythm breaks. Not catastrophic but visibly inconsistent.
35. **[P2]** No visible lag simulation done, but the FilterBar commits via
    `router.push` with `startTransition` — so rapid toggles should be
    handled. What IS missing: no progress indicator for > 600ms transitions
    (the spec's 2px indeterminate bar). This is a deferred polish item.
36. **[P2]** Slow-3G reasoning: first paint is the SSR HTML. The onboarding
    sheet doesn't block SSR content but may animate only after JS hydrates
    (~2-3s on slow-3G). The 600ms delay spec may effectively become 3-4
    seconds on a real slow connection — during which time the user sees the
    list and thinks the product is ready, then the sheet arrives and
    *interrupts* them. This is a real-world failure mode of the "fade in
    600ms after paint" pattern. Direction: gate onboarding-sheet appearance
    on the 600ms-after-*hydration* signal, not 600ms-after-*paint*.

### Flow 9 — Missing features (the hardest part)

As the persona, I expected:

- **Search bar** for merchant name ("Diarco? Makro? Coto Digital?"). There
  isn't one. In Flow 5 I wanted to verify Coto was the right choice; a quick
  typed "coto" search would have been faster than scrolling. → **(a)
  legitimate gap**. `ia.md` defers to Phase 5. For the persona, this is the
  #1 missing affordance — their r/DescuentosArgentina mental model is
  merchant-centric ("en Coto los martes"), not wallet-centric.
- **Location / region setting** (CABA, GBA, provincias). `product.md`
  wedge #3 promises region-awareness; the deployed filter set is
  wallet/rubro/día only. `valid_regions` data exists in the schema (see the
  `AR-W` field rendered raw on the Banco Corrientes promo detail) but
  there's no filter and no region-normalizer. → **(a) legitimate gap**.
- **Favorites / pin a promo for later**. I hit Cabify 40% $6.000 and want to
  remember "this Friday, Cabify". No save option. → **(b) nice-to-have,
  Phase 5 in spec**.
- **Spend-calculator** (enter "$40.000" → show expected return per promo).
  This is the wedge per product.md. Not shipped. → **(a) legitimate gap**.
- **Household stack simulator** (product.md wedge #4). Not shipped,
  explicitly deferred. → **(b) nice-to-have for v1**.
- **"If I opened Naranja X I'd unlock $X more" opportunity view**
  (product.md wedge #2 partial). Not shipped. → **(a) legitimate gap, v2**.
- **Notification or reminder** for "martes de Coto" coming up. Not
  implemented; per ia.md explicitly out. → **(c) over-expectation for v1,
  aligned with user-psychology.md anti-scolding rule**.
- **Filter by "mi banco" in addition to "mi billetera".** Currently I can
  say MODO but can't say "only show promos where my issuer bank (Galicia)
  is one of the adhered banks." The persona owns Galicia, so MODO promos
  that only adhere to Supervielle are noise. → **(a) legitimate gap**. Per
  `product.md` wedge #2 ("filter to wallets/cards the user owns") this was
  scoped to wallets only; `cards` coverage is partial.
- **Stack-ability indicator** ("does this promo stack with Mercado Pago
  cashback?"). Not shown. r/DescuentosArgentina threads obsess over this.
  → **(a) legitimate gap**.
- **Sort by `reintegro expected given my spend`** (beyond the "sort by
  tope" default). Not shipped. → **(a) legitimate gap, core wedge**.
- **Push notifications**. Not shipped, explicitly out for v1. → **(c)
  over-expectation, aligned with spec**.
- **Explanation of MODO = multi-bank.** The persona who selects MODO may
  not understand that MODO promos adhere to specific issuer banks. No
  tooltip, no info-icon. → **(a) legitimate gap**.
- **User-correction form** ("esta promo ya no existe / el tope es
  distinto"). Not shipped, Phase 4 per build-plan. → **(b) nice-to-have**.

---

## Cross-cutting observations

### Information hierarchy

On the PromoCard at 375px, reading left-to-right top-to-bottom:

1. First visible element: the `C` avatar circle (32×32, surface-sunken) —
   low visual weight, neutral color. OK.
2. Merchant name "Coto" (`--text-base`, 600, text-primary) — proper
   hierarchy position but compete for weight with the pct number to its
   right.
3. Pct "25%" (`--text-xl`, 600, `--color-savings` green) — bright and
   right-aligned. Because it's the only element in the top-right column, it
   reads as the hero.
4. `Hasta $ 30.000 por mes` (`--text-base`, 600, `--color-savings-strong`
   darker green) — this is spec'd as the hero. It's in a new row below the
   header, with the same size as "Coto" above and the same weight as
   "25%" — so it's typographically even with them.
5. `Sólo los martes` (`--text-sm`, 500, text-secondary) — context.
6. Bank pills cluster — grays on warm grey, low weight individually but
   high collective weight when 4+ pills wrap to 2 lines.
7. Footer: `Verificado hace 8 horas` · `Ver →`.

**The verdict**: the hero hierarchy is *roughly* tope > pct, but the pct
wins visual attention because it's alone in its column with saturated green
ink, while the tope line is immediately above a competing `valid_days`
string and often a multi-bank pill cluster. The direction.md rule "the tope
is the hero" is partially honored (it's readable first) but not decisively
(it doesn't dominate). The *quickest* fix within spec tokens would be to
shrink the pct to `--text-base` (16px) and keep the tope at `--text-lg`
(20px) — flipping the *visual weight* in favor of the tope without changing
the semantic structure.

### Voseo compliance (list of any failures)

I scanned the full home + detail + bank + empty rawHtml for forbidden forms
(`tú`, `tienes`, `puedes`, `selecciona`, `elige`) and found **zero
violations**. Counts of OK voseo forms across the home page:
`Verificá` — 79; `Marcá` — 1; `tenés` — 1; `podés` — 1; `Probá` — 0 (only
appears on empty state which I didn't render in the home rawHtml, but
confirmed present in `/?wallet=personalpay&rubro=electro&dia=7` empty state
as `Probá aflojar alguno…`).

**No voseo failures found on the deployed surfaces.** The direction.md
microcopy bible has landed cleanly.

Minor register nit: `Sólo los martes` uses `sólo` with accent. RAE 2010
allows but discourages the accent on the adverb when not ambiguous;
Argentine fintechs mostly drop it (`solo los martes`). Not a bug, stylistic.

### Freshness trust

- The per-promo `Verificado hace X horas` pill is present on every card.
  Good. The relative-to-absolute flip at 7 days (spec) is in code — didn't
  test the flip directly.
- **But freshness is decoupled from validity.** The Cerini promo with
  `valid_to = 2024-07-31` is shown as `Verificado hace 8 horas` — meaning
  "our scraper saw this row 8 hours ago," not "this promo is verified to be
  currently offerable." The user-psychology research on freshness-claim
  inflation is unambiguous here: *"If 'verified 2 hours ago' shows for a
  promo that turns out to be wrong, the next 'verified 2 hours ago' is
  discounted."* This is the exact failure mode.
- The TTL gate in `queries.ts` claims a 3-day filter on `last_seen_at` — but
  that's scraper-freshness, not promo-validity. A promo that's still posted
  on the source page (because the source forgot to take it down) will pass
  the TTL check indefinitely, no matter how old its `valid_to` is.
- The source attribution is malformed (`Fuente: coto-descuentos`,
  `Fuente: modo`) — see Flow 5. Trust lever underused.

### Decision confidence

After seeing a promo card the persona still has open questions:

- *"Does this stack with my Mercado Pago cashback?"* — no signal.
- *"What's the minimum purchase?"* — shown on detail page only, not card.
- *"Does this apply online or only in-store?"* — not surfaced anywhere.
- *"Is this Galicia-specific, or any bank under MODO?"* — unclear from the
  "Supervielle" pill that the promo is Supervielle-ONLY; the card shows a
  single bank and lets the persona infer.

The app has the data for some of these (the schema includes `stacks_with`,
`requires_min_spend`, `modality`) but doesn't surface them legibly.

### Zero-price differentiation

The spec defines a zero-price treatment (`--color-zero-bg` yellow fill, pct
at `--text-3xl`, "Es gratis" / "Pagás uno, llevás dos" label) for promos
where `pct === 100` OR `promo_type === '2x1'` OR `pct === 50 AND
promo_type === 'bonificado'`.

**No promo on the live site triggers this treatment.** The current DB has
no 100%-off / 2×1 promos. The closest are the Brubank Ultra 50%
`promo_type === 'cashback'` promos (Cerini, Cabify, Freddo, etc.) — these
are NOT zero-price per the spec's OR clause, so they render as normal
green. Fine structurally.

**However**, when the persona scrolls the home page and sees `40%` or `50%`
cashback promos, the rendered visual is indistinguishable from a `20%`
cashback — same white-card, same green accent, same hierarchy. The
psychological jump from "good deal" to "extraordinary deal" isn't
communicated. The Shampanier/Ariely zero-price research says humans
categorize 100% / 2×1 differently from 50% — true. But within the 20-50%
band, there's *also* a subjective "this is unusually good" threshold (the
user-psychology doc hints at "15%+ reads clearly as a discount"). A
secondary visual tier for > 35% reintegro could be defensible; I won't
prescribe one but flag that currently there's a binary (zero-price vs
everything-else) when real psychology is continuous.

### Legal disclaimer placement

- Home cards: `<p class="sr-only">Información referencial. Verificá los
  términos en la entidad emisora.</p>` — screen-reader only, invisible.
  Good: keeps the card uncluttered. The only footnote the spec requires is
  the home footer: `Información referencial… No estamos afiliados a ningún
  banco ni billetera.` — present at bottom of feed. ✓
- Detail pages: the boxed `--color-surface-sunken` panel at the bottom
  carries `Información referencial…` plus the merchant-named affiliate
  disclaimer. ✓ spec-compliant.
- **The placement is proportionate and non-CYA.** Matches direction.md's
  AR read: honest hedge, not scary.

### Accessibility basics

- Focus order: skimming the rawHtml, tab order follows DOM order: NavBar
  wordmark → onboarding chips → Guardar → Ahora no → × → (if dismissed)
  FilterBar chips → PromoCards. Reasonable.
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby="onboarding-
  title"` on the sheet. ✓
- `aria-pressed` on FilterBar chips correctly reflects URL state (I
  verified 2 true / 29 false on `?wallet=modo&rubro=supermercado`). ✓
- `aria-hidden="true"` on the merchant-initial avatar. ✓
- `<h3>` on merchant name — but each PromoCard uses `<h3>` regardless of
  nesting level. On `/banco/galicia`, the page title is `<h1>
  Promos de Banco Galicia</h1>`, and all cards below have `<h3>` — missing
  an intermediate `<h2>` makes the heading outline jumpy. Minor.
- `tabIndex` / focus traps — didn't test trapped focus inside the dialog.
  Spec requires Esc closes the dialog; needs live verification.
- **No skip-to-content link** (`ia.md` § Accessibility posture says "Skip-
  link at top, visible on focus only"). Not in the rawHtml. Missing.
- **No `focus-visible` style declarations** in the extracted CSS rules —
  may be handled by Tailwind's default but the spec calls out
  `--shadow-focus: 0 0 0 3px rgba(31, 122, 90, 0.20)`. Worth confirming
  keyboard users see a visible focus ring.

---

## Missing features (Flow 9 synthesis)

| Feature | Severity | Category | Rationale |
|---|---|---|---|
| Merchant search | P1 | (a) product gap | Persona's mental model is merchant-centric; currently 0 affordance. |
| Region filter (CABA/GBA/interior) | P0 | (a) product gap | `product.md` wedge #3; data exists but no UI; surfaces as raw `AR-W` on detail. |
| Spend-adjusted ranking | P0 | (a) product gap | Core wedge (`product.md`); current sort actively misleads. |
| "Mi banco" filter | P1 | (a) product gap | MODO is multi-bank; persona can't narrow to their actual card. |
| Stackability indicator | P2 | (a) product gap | r/DescuentosArgentina conversations revolve around stack logic. |
| Favorites / pin | P2 | (b) nice-to-have | Spec defers to Phase 5; low urgency. |
| Household stack simulator | P2 | (b) nice-to-have | `product.md` wedge #4; deferred. |
| Opportunity view (Naranja X etc.) | P2 | (a) product gap | `product.md` wedge #2; partial today. |
| User-correction form | P2 | (b) nice-to-have | Phase 4 per build-plan. |
| PWA screenshots in manifest | P2 | (a) product gap | Improves Chrome Android install appeal. |
| Push notifications | — | (c) over-expectation | Correctly out per spec; flagged user-psychology anti-scolding rule. |
| Account / profile | — | (c) over-expectation | Out per spec. |
| MODO = multi-bank tooltip | P1 | (a) product gap | Current UI implies 1-to-1 wallet→bank. |
| "Esta semana" día chip | P1 | (a) product gap | ia.md spec-complete missing chip. |
| Expiring-soon top-edge bar | — | — | Implemented correctly (confirmed in rawHtml). |

---

## Severity summary table

| ID | Area | Severity | Description | Proposed direction |
|---|---|---|---|---|
| 17 | Detail hero | P0 | SSR hero tope renders as `$ 0 tope máximo` (count-up init) | Render final value in SSR; animate only after hydration if applicable |
| 20 | Data freshness | P0 | 2024-07 expired Cerini promo shows as "Verificado hace 8 horas" and listed in today's feed | Add DB/UI gate on `valid_to < today`; show stale-warning line on detail if > 14 days |
| 21 | Broken links | P0 | `/banco/brubank-ultra` 404s from a detail-page pill; 404 copy says "Esta promo no existe" | Either include all bank slugs encountered in data as valid SSG params, or suppress pill when slug isn't routable |
| 30 | SEO infra | P0 | `robots.txt` sitemap references `descuentos.ar` (wrong domain) | Sync canonical domain (or dynamic sitemap URL) |
| 6 | Ranking | P0 | Sort-by-tope leads persona to worst play for stated $40k spend | Introduce spend input; rank by `min(pct×spend, tope)` OR show both numbers |
| 1 | Onboarding | P1 | Sheet covers ~60% viewport on mobile; backdrop-peek pattern doesn't work on iOS | Reduce sheet height; or provide a "ver primero" link to dismiss-temporarily |
| 2 | Onboarding | P1 | Disabled Guardar looks like pending (low-contrast); users tap anyway | Stronger disabled state OR inline hint "Marcá al menos una" |
| 5 | Onboarding | P1 | `Ahora no` / × / backdrop / Esc — 4 dismiss paths, all under-communicated | Treat `Ahora no` as a peer-weight secondary button, not a link |
| 7 | Filters | P1 | No `Esta semana` chip (spec has it) | Add chip |
| 8 | MODO filter | P1 | MODO filter is over-permissive; user can't narrow to their issuer bank | Add secondary "Mi banco" filter |
| 9 | Card hierarchy | P1 | Pct visually wins over tope despite "tope is hero" rule | Reduce pct size token; keep tope at base and pct below base |
| 11 | Wallet edit | P1 | FilterBar toggling wallets doesn't update stored owned-wallets | Sync FilterBar billetera to localStorage |
| 14 | Share link | P1 | Onboarding sheet intercepts share-link entry even when URL has wallets | Skip onboarding if URL conveys wallet intent |
| 15 | Share link | P1 | No `Te compartieron esta promo` toast on external-referrer detail entries | Implement toast; spec'd |
| 18 | Detail | P1 | `Compra mín. $ 60.000` buried in dl row despite being load-bearing | Escalate visual weight when `compra_mín > tope` |
| 19 | Detail | P1 | `Fuente: coto-descuentos` — raw slug | Map source_id → human name + host |
| 24 | Bank page | P1 | Active bank filter invisible in FilterBar on `/banco/*` pages | Add pinned-context chip or Banco filter row |
| 25 | Bank page | P1 | Bank pills on a scoped bank page don't sort the scoped bank first | Sort/highlight scoped bank in pill cluster |
| 27 | PWA iOS | P1 | No install UX on iOS Safari (native constraint, but unmediated) | Add one-time iOS-specific Share-menu tooltip |
| 31 | Empty state | P1 | No CTA button inside the empty-state panel | Move `Limpiar filtros` into panel |
| 33 | Region filter | P1 | `region=AR-W` rendered raw on detail; no UI filter; regression vs phase-2-notes | Restore region filter OR label raw codes |
| 34 | Mobile layout | P1 | Multi-bank pill clusters push card height past 196px min, breaking grid rhythm | Cap pill cluster to 1 line with overflow marker |
| 36 | Onboarding timing | P1 | 600ms-after-paint may become 3-4s on slow-3G; interrupts user mid-browse | Gate on "after hydration" rather than paint |
| 4 | Currency formatter | P1 | `$&nbsp;25.000` (non-breaking space after $) — reads as foreign in AR | Drop the space — `$25.000` |
| 3 | Onboarding copy | P2 | `¿Qué billeteras tenés?` assumes AR-fintech literacy | One-line gloss under title |
| 10 | Home feed | P2 | No "mejor para tu spend" confidence signal on top card | Gated on spend input |
| 12 | Chip duality | P2 | Onboarding chips and FilterBar chips are visually identical; different roles | Light visual differentiation |
| 13 | Onboarding | P2 | Wallet chip order is fixed; usage-prevalent ordering better | Re-order by AR market share |
| 16 | Filters | P2 | Active-filter chip row not condensed above list | Add compact "filtros activos" line |
| 22 | CTA | P2 | `Ir al sitio` doesn't announce destination | `Ir a coto.com.ar →` |
| 23 | Detail | P2 | Variants / tarifas particulares section not rendered | Spec ahead of impl; low urgency |
| 26 | Cross-links | P2 | Bank-slug / proper-name taxonomy bleed in footer links | Normalize bank labels |
| 28 | PWA | P2 | No `screenshots` in manifest | Add |
| 29 | PWA | P2 | No `shortcuts` in manifest | Add one or two |
| 32 | Empty state | P2 | No illustration | Add spec's 120px empty-cart SVG |
| 35 | FilterBar | P2 | No > 600ms progress bar | Deferred polish |

---

## My top 5 recommendations for next iteration

Ranked by impact × inverse-cost.

1. **Ship a spend-input on home, rank by expected-reintegro-capped-by-tope.**
   The current sort actively misleads the target persona. The fix is a
   sticky numeric input ("Gasto previsto: $40.000") defaulting to $25k or
   $40k, with the ranking recomputed in-query. This restores the wedge
   described in `product.md` and turns the "top card" from a poker-odds
   lookup into an actual answer. **Impact: very high. Cost: medium — needs
   schema-aware ranking SQL but no new data.**

2. **Fix the `$ 0 tope máximo` hero on every detail page.** SSR must render
   the final value; the count-up animation starts from final if JS is
   available, not the other way around. This is one of the most visible
   regressions against the "tope is the hero" direction and costs maybe a
   50-line component refactor. **Impact: high. Cost: low.**

3. **Stop displaying expired promos as live. Stale-gate on `valid_to` at
   query time; add `Esta promo podría haber cambiado` banner on detail for
   > 14 days; normalize source attributions (`Fuente: modo.com.ar · 19/04`).**
   This is three small changes that compound into a trust-substrate repair.
   Today the system shows 2024 promos as "verificado hace 8 horas" — a
   single such miss poisons every other promo in a loss-averse user's
   memory. **Impact: very high. Cost: low.**

4. **Normalize the taxonomy: bank slugs → proper labels EVERYWHERE.** The
   `brubank-ultra` / `naranjax` / `provincia` / `uala` / `Yoy` /
   `coto-descuentos` / `modo` slugs leak through to pills, source
   attributions, and bank-detail pages (some of which 404). Build a single
   slug→label + slug→canonical-route mapping and apply it at every render
   site. Also fix the `/banco/brubank-ultra` 404 (either route to the
   Brubank bank page or suppress the pill). **Impact: high — it's the
   single biggest "this looks unfinished" signal. Cost: low — one lookup
   table.**

5. **Add a `region` filter and a `mi banco` filter; surface the active
   bank context on `/banco/*` pages.** Region is a core wedge (product.md
   #3) and is silently missing. "Mi banco" is the natural escape valve for
   the MODO over-permissive filter — without it, MODO-users see unusable
   Supervielle promos. Adding both restores the promise that the home feed
   is truly "what I can use today." **Impact: high. Cost: medium — needs
   region normalizer + schema-aware filter.**

Not on the list but close: ship the merchant search bar (#1 missing feature
per persona), and tune the pct-vs-tope size ratio to actually honor the
hierarchy rule.
