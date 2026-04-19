# User Psychology — Deal-Hunters in Argentina

> Research brief for the UI/UX redesign of an Argentine discount aggregator.
> Input for the synthesis agent (Round 2). Evidence and insight, not design decisions.

---

## The user we're designing for

The user describes the wedge in his own words: *"I love it. I want to go and buy only on the places I will get a discount, to have that sensation of 'winning' when buying."* That single sentence is the entire persona. He is not hunting the largest possible discount; he is hunting the **feeling of having beaten the default transaction**. Where a normal consumer walks into a pharmacy and pays, our user walks in having already *pre-selected* that pharmacy because it was the square on the board where his particular wallet combination scored highest today. The app's job is not to display promos — it is to manufacture and deliver the small psychological "win" that turns a chore (groceries, lunch, a pharmacy run) into a tiny victory.

Behaviorally, he maps onto what behavioral economists call a **transaction-utility maximizer** (Thaler, 1983/1985): someone who draws pleasure not merely from acquiring a good but from the perceived spread between the expected price and the actual price paid (newristics.com/heuristics-biases/transactional-utility). He is also a textbook **loss-averse peso-holder in a volatile economy**: Argentina closed 2025 at 31.5% inflation (lowest in 8 years, after 117.8% in 2024 and 211.4% in 2023 — BBVA Research, Reuters). Every peso he does not lose to "buying somewhere he could have saved" feels doubly meaningful because pesos are actively melting. He is WhatsApp-native, forum-fluent (r/DescuentosArgentina, r/FinanzasArgentina), and he already knows the jargon: *tope*, *reintegro*, *billetera*, *acreditación*.

The single most important thing to internalize: he is **not discovering deals**. He is **verifying which of his known wallets wins today**. The primary question is not "is there a deal?" but "which of *my* tools do I pull out of the holster?"

---

## The psychology of winning

### Why savings feel better than neutral acquisitions

Prospect Theory (Kahneman & Tversky, 1979; Wikipedia, ScienceDirect, Rutgers) establishes the asymmetry: losses are felt roughly 2x as strongly as equivalent gains, and outcomes are always evaluated **relative to a reference point**, never in absolute terms. Paying $20.000 for a pair of shoes is a neutral baseline transaction. Paying $14.000 for the same shoes because of a 30% reintegro is not experienced as "spending $14.000" — it is experienced as "gaining $6.000 back from a loss I was about to take." The reference-point framing converts an expenditure into a recovered loss, which prospect theory says the mind encodes with roughly double emotional weight vs. a raw $6.000 windfall.

Richard Thaler's **transaction utility** (1983, Nobel 2017) adds the second layer: the pleasure of a purchase decomposes into *acquisition utility* (do I want the thing?) plus *transaction utility* (did I get a deal on it?). Transaction utility is pure psychology — it has nothing to do with the object. It is the reason people buy things at 50% off that they would not have bought at full price even when they can afford either. Our app is, in effect, a **pure transaction-utility delivery service**: its value proposition is the spread, not the goods. This is why the user describes it as a sensation of *winning*, not as a sensation of *getting*.

Beneath both frameworks is a plausible neurochemical story: dopamine fires on **positive prediction error** — reward that exceeds baseline expectation. A full-price transaction matches expectation, so the dopaminergic response is flat. An unexpected discount is, by definition, a positive prediction error and triggers reward-system activity. Consumer-psychology popularizations (Journal of Consumer Psychology citations in the mainstream sources we found) describe this as the "bargain buzz." The app should be thought of as a prediction-error engineering tool: it must keep surfacing small positive prediction errors against the user's mental baseline of "what I would have paid."

### Threshold effects — when a discount crosses into "win" territory

**Zero is special.** Shampanier, Mazar & Ariely's "Zero as a Special Price" (2007, Marketing Science) is the canonical study: when Hershey's Kisses dropped from 1¢ to free and Lindt truffles dropped from 15¢ to 14¢, the share of customers choosing Hershey's flipped from 31% to 69% even though the price *difference* was identical (thedecisionlab.com/reference-guide/psychology/zero-price-effect). Ariely's conclusion: free is not a price on a continuum; it triggers a qualitatively different affective mode (social/emotional) rather than a transactional cost-benefit. **Implication for our app:** "100% reintegro" and "2×1" (effectively half free) are psychologically privileged values; they should probably look different on screen than a generic 20% promo, even though in pure peso terms a 30% reintegro on a $40.000 expense can yield more cash.

Hossain & Saini (2015, *International Journal of Research in Marketing*) found the zero-price effect is amplified for **hedonistic** products (chocolate, restaurant, beauty) over **utilitarian** ones (sugar, pharmacy staples). This suggests the "win" feeling is category-conditional — discounts on indulgences feel better than discounts on necessities, peso-for-peso. Our app spans both. A free coffee reads as a trophy; a $500 saved on toilet paper reads as diligence.

On thresholds within the non-zero range, the behavioral-economics literature we surveyed does not give a clean "minimum % for perceived win" number — the effect is reference-dependent. However, two heuristics emerged:

- **Ratio preference bias** (Newristics): people judge discounts by percentage off a small base more generously than the same absolute peso amount off a large base ($500 off a $5.000 item feels better than $500 off a $50.000 item). In a cashback context dominated by *topes*, this has a real consequence: a low-tope high-% reintegro can feel more like a "win" than a high-tope low-%.
- **Left-digit bias** and round-number effects: crossing $10.000 saved, $50.000 saved, etc. are disproportionately satisfying. A running-total feature would lean on this.

A useful working heuristic the synthesis agent can assume: in the Argentine inflation context, **absolute peso amounts above roughly one coffee (~$3.000-$5.000 AR in 2026) begin to feel like a real win**; anything below that is "nice but nothing." Relative to the purchase, **15%+ reintegro reads clearly as a discount** in the r/DescuentosArgentina community tone we observed — below 10% is often dismissed as "no vale la pena." These are judgment calls, not established thresholds.

### What kills the "I won" feeling (patterns to avoid)

Honey — the canonical competitor — is instructive precisely for its failures. The 2019 UX Collective piece ("The obscure side of Honey," uxdesign.cc) and the 2024-2025 MrBeast-triggered exposé (news.ycombinator.com/item?id=43538113) converge on a diagnosis:

1. **Moment-of-purchase interruption**. Honey pops up at checkout with aggressive banners; users report this as "nagging" not "helping." The affordance reads as friction, not reward. The peak emotional moment (applying the coupon) was diluted by the UX cost of closing the pop-up.
2. **Opaque outcome**. Users didn't know if Honey had found the *best* coupon or just *a* coupon. Post-exposé this turned out to be strategically true, but even before, the ambiguity itself undermined the "win" feeling because users couldn't be sure they had won.
3. **Value leakage**. Honey secretly overwrote affiliate cookies, and this erosion of trust retroactively poisoned every prior interaction.

The general mechanism: **the "I won" feeling is fragile and asymmetric.** It takes one dissonant signal to collapse it. A promo that turns out to be expired, a *tope* that was lower than the UI suggested, a wallet that didn't actually accredit the reintegro — each of these is a negative peak that overwrites a month of positive ones (Kahneman & Fredrickson, 1993, via nngroup.com/articles/peak-end-rule/). Loss aversion works against the app as much as for it: users will remember one failure more than ten successes.

Corollaries observed in the research:

- **Fake urgency poisons trust** (krakendata.com/blog/urgency-and-scarcity-messaging-real-world-examples, megbrunson.com/artificial-urgency, deceptive.design/types/fake-urgency). Countdown timers that reset, "only 2 left!" counters that don't change — these register as manipulation once users catch on, and the "win" is retroactively reframed as "being played."
- **Too many decorative "saved you money" banners** habituate the user. If every screen celebrates, nothing feels celebratory. The peak-end rule requires a contrast: flat baseline, sharp spike at the moment that matters.

---

## Deal-hunter mental models

### "Knowing" vs "discovering" modes

Serious deal-hunters in Argentina are in **knowing mode**, not discovering mode. The r/DescuentosArgentina threads we reviewed (1j7gbdy — "Descuentos por pago con QR de MODO"; 1kdbusb — "Mejor billetera virtual para descuentos"; 1gmlxdq — "Les funcionan los reintegros de MODO"; 1g1ji0h — "25% de reintegro con tope de 10k por Banco con Modo") show a striking pattern: users already know the promos. They know Credicoop has a Saturday Diarco deal. They know Banco Provincia does supermarkets on Wednesdays. They know Naranja X had 26% TNA last quarter. What they want verified is **"does this still work this week, and does it stack with X?"**

The mental model is closer to a **poker player checking the odds table** than a shopper browsing a mall. Each wallet is a card in hand; each day of the week has a known board; the app should be the fast lookup that confirms the play. This is a profoundly different posture from the e-commerce *discovery* users that most NN/G ecommerce research is calibrated for (nngroup.com/articles/ecommerce-homepages-listing-pages, ecommerce-product-pages, comparison-tables).

The implication is that **search, filters, and categories are secondary**. The primary surface is "given my wallets + today's date + optionally a category, which single play wins?" This is closer to Google Flights' "best match" answer than to Amazon's listing grid.

A second observation: deal-hunters treat knowledge as *identity and social capital*. The r/DescuentosArgentina threads include many users explaining promos to newer users with a teacher's posture. An app that talks down to these users, or over-explains mechanics they already know, risks feeling condescending. Conversely, an app that respects their fluency — short names, jargon tolerated, no hand-holding — reads as made-for-them.

### Urgency without anxiety

The urgency problem is real because discount validity is real: *solo hoy*, *hasta el 20/04*, *viernes y sábado*. The question is how to encode this without sliding into dark-pattern territory.

The krakendata.com and growthsuite.net sources distinguish three modes:

1. **Real, dated urgency** ("Vence mañana 19/04 a las 23:59"). Specific, verifiable, non-manipulative.
2. **Ambient time-awareness** ("Hoy", "Esta semana"). Informational, not pressuring.
3. **Manufactured urgency** (countdown timers that reset, "only X left" without inventory truth). Dark pattern.

The deal-hunter literature pushes toward modes 1 and 2, and away from mode 3. In an Argentine context specifically, users have been burned enough by fake sales (Hot Sale, Black Friday "descuentos" that are price hikes reversed) that manufactured urgency is read as distrustable by default — the r/DescuentosArgentina community regularly posts screenshots of historical prices to mock fake sales. Earned trust, not pressure, is the lever.

A useful design mechanic observed in the sources: **calm urgency is temporal framing, not visual alarm**. Apple Wallet's expired-pass treatment is a soft graying and a "Ya expiró" label; it does not flash red. The same promo displayed with "Vence hoy" in muted color communicates urgency without activating threat response. Red countdown timers activate the sympathetic nervous system; calm typographic dates do not.

### Choice overload and the role of sort order

NN/G's "Simplicity Wins over Abundance of Choice" (Loranger, 2015, nngroup.com/articles/simplicity-vs-choice) and the parallel Hick's Law literature (lawsofux.com/hicks-law) both converge on the same finding: **decision time scales logarithmically with options, but satisfaction falls off a cliff past a small threshold** (commonly quoted as ~7 options, though the exact number is task-dependent). A 50-promo list is not navigable — not because 50 is hard to scroll, but because 50 creates a *nagging residual* ("did I miss a better one?") that undercuts the satisfaction of the pick.

The deal-hunter does not want 50 options. He wants **one answer with the math shown so he trusts it**. The mental model is closer to "show me the best play, and let me verify by seeing the runners-up behind it."

NN/G's ecommerce research (nngroup.com/articles/filter-categories-values) is explicit that filters become a wall when:
- their values are not predictable from the user's vocabulary,
- applying them requires multiple taps before results update, and
- their presence implies "you have to choose before we help you."

For our user, the most dangerous filter is the one that gates the answer. If he has to declare categories and wallets and spend amount before seeing anything, the app has failed its "fewest clicks" brief. A better model is **smart default + optional refinement**: show a ranked board for his already-known wallets as the first screen, and let refinement be opt-in.

On sort order specifically: the user's explicit need is ordering by tope. But tope alone is an oversimplified sort — a $50.000 tope at 5% is worse than a $20.000 tope at 30% for someone spending $40.000. The synthesis agent should consider that the "right answer" is likely a **composite score** (expected reintegro given assumed spend), not raw tope. This is both a design and a product question.

---

## Argentine context

### Language and register — voseo, trust register, informal-friendly

The voseo is not a dialect feature; it is the **default register of every successful Argentine consumer brand**. Every screenshot of Mercado Libre, Mercado Pago, Ualá, Naranja X, Cuenta DNI, Galicia Move, BBVA, and Santander Argentina uses **vos**, not tú. "Ingresá", "Conectate", "Tocá acá", "Tenés", "Podés" — these are the observed forms. The spanishlinguist.us fieldwork posts (2024) confirm: Argentine public-facing copy overwhelmingly uses voseo, to the point that the Ezeiza airport uses *Conectate* and *Tentate* on official signage, and La Segunda's national slogan is *Lo primero sos vos*. Using *tú* forms would not be "neutral Spanish" — it would be read as foreign-made, translated-from-English-by-a-non-Argentine, and would immediately degrade trust.

Voseo conjugation, for reference:
- Present: *vos tenés / podés / querés / sos* (not *tú tienes / puedes / quieres / eres*)
- Imperative: *tené / podé / fijate / ingresá / pagá / elegí* (vowel-final, no accent on enclitic: *fijate*, *llevate*, *sumate*)
- Note the RAE-flagged accent-mark trap on imperatives with enclitics (spanishlinguist.us/2024/08/fun-with-voseo-in-argentina-part-2): *¡Conectate!* (no accent on enclitic form) vs *¡Abróchese!* (formal, accent required). Native-Argentine copywriters frequently mis-accent these; the synthesis agent should be aware and QA carefully.

On **register**, the correct zone is **informal but respectful**, not colloquial-slang. Mercado Pago's tone is the reference: vos-forms, short sentences, no *che/boludo*-level slang, no gratuitous lunfardo, but also no corporate stiffness. The tone is "competent friend who's on your side." The r/DescuentosArgentina community tone is slightly more colloquial ("banco que me re sirve", "si la billetera te banca") — our app can borrow warmth from there but should not try to impersonate a subreddit.

On **gendered language**: Argentina has an active inclusive-language discourse (*todes*, *x*, *@*), but Mercado Libre's public-facing style has largely settled on neutral phrasing that sidesteps the issue (e.g., *"tus compras"*, *"tu cuenta"*) rather than using *todes*. Imitating MP/ML is the safe path; *todes* is polarizing and can feel performative depending on audience.

A small but real detail: the **"che"** interjection, *boludo/a*, and hyper-Buenos-Aires slang should be avoided. Córdoba, Rosario, and Mendoza users experience Porteño slang as alienating. Voseo itself is pan-Argentine (and pan-Rioplatense, including Uruguay); Porteño slang is not.

### Currency display — AR conventions

AR currency formatting uses **`.` as thousands separator and `,` as decimal** — the inverse of US convention. This is codified in RAE style and matches AFIP/INDEC official usage. `$25.000,50` is twenty-five thousand fifty centavos; `$25,000.50` would read as twenty-five and a half pesos (and look foreign/wrong). JavaScript `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })` produces the correct output.

In practice, Argentine fintech apps (MP, Ualá, Cuenta DNI) drop the decimals entirely for whole-peso amounts (*$25.000*, not *$25.000,00*) because with inflation the centavo has no meaningful purchasing power and rendering it clutters the UI. Decimals appear only when they matter (exchange rates, percentages, rendimientos). The synthesis agent should follow this convention: **integer pesos for savings amounts, decimals only when semantically meaningful**.

Two more observations:

- **Currency symbol**: `$` alone is used locally and unambiguously means peso argentino in-country. `AR$` and `ARS` appear in cross-border and explicit-disambiguation contexts (e.g., when USD prices also appear). For a domestic app, bare `$` is correct and reads as local; `ARS` can read clinical/international. `$` with no space before the number is the Spanish-American standard (`$25.000`, not `$ 25.000`).
- **"Pesos" vs "$"**: spelling out *pesos* is warm and conversational ("ahorraste 5.000 pesos"), the symbol is efficient and scannable ("$5.000"). Mercado Pago uses both, choosing based on surface (marketing copy spells it out, in-app transaction rows use the symbol).

### Cultural affordances — what reads as local, what reads as imported

The trust-visual vocabulary of Argentine fintech converges on a narrow palette:

- **Mercado Libre/Pago yellow** (`#FFE600`) is the dominant local brand color and is everywhere — it has become functionally equivalent to "commerce" in the Argentine visual unconscious. Using yellow as a primary signals MP-alignment (positive); avoiding yellow entirely keeps distance (also viable for a distinct identity).
- **Clean typographic rhythm on cards** with price as hero, merchant as second, modality tags (Envío Gratio, Cuotas sin interés) as third. Mercado Libre's product-card taxonomy is a local canon.
- **Real photography of merchants and products**, not illustration. Argentine users respond to "I recognize this supermarket" more than to stylized iconography. Cuenta DNI and MP use merchant logos prominently.
- **Shades of blue/green for trust** (banking heritage), with accents in a warm color. Ualá's violet and Naranja X's orange are exceptions that succeed by owning a non-traditional color, but they are the exception.

Things that read as imported and erode trust:

- **US-fintech dark-mode crypto aesthetic** (Robinhood, Coinbase). Argentine users over-index on "this is not a bank" → "this might be a scam." The user's explicit brief — "calmer colors, more white-ish, not dark as how it currently is" — is aligned with this: white-and-blue reads banking-trustworthy; dark-mode-plus-neon reads crypto-risky.
- **Asado/maté/tango stereotype imagery**. Reads as made-for-tourists, condescending.
- **Generic Latinx imagery** (sombreros, cactus, non-Argentine accent voice-overs in video). Reads as made-in-a-Miami-agency.
- **US-centric iconography** ($ bills, 💵). AR uses its own symbol set; stacks-of-dollars-emoji reads as culturally off.

### Inflation-era salience — why a saved peso matters more

Even with 2025's deceleration to 31.5% (Reuters, BBVA), Argentines have spent multiple years in 100%+ inflation regimes. Two psychological consequences are relevant:

1. **Reference-price instability**. Users do not have stable mental anchors for "what this should cost." Thaler's transaction utility requires a reference price to compute the "good deal" spread — when the reference price itself is drifting weekly, the user relies more heavily on **tools that claim to know the current best deal** because their internal model is unreliable. Paradoxically, this increases the app's perceived value: in a stable economy the user can feel savvy by remembering last month's price; in AR he *can't*, so the app substitutes for that broken mental cache.

2. **Money illusion is eroded but loss aversion is amplified**. Argentines are unusually aware that nominal peso amounts do not equal purchasing power (the research on Argentine inflation literacy, elibrary.imf.org article cited above, speaks to this). They discount nominal savings slightly ("$5.000 is not what it was") but simultaneously feel *any* loss more sharply because every peso is a peso that could have been preserved against a melting currency. The net effect is that **the emotional weight of "you saved $X" is higher in AR than in a stable economy**, but the bar for what counts as a meaningful X is also constantly moving up.

The implication is subtle: the app should display **both the absolute saving AND an intuitive unit of purchasing power** where possible. "Ahorraste $5.000 (≈ 1 café + 1 medialuna)" collapses the mental math the user is doing anyway. This is a judgment call — it may feel gimmicky if overdone — but the mechanism is real.

A related point: **MODO and billetera reintegros function as partial inflation hedges** in users' perception. A 30% reintegro with a $10.000 *tope* is not *just* a discount — it is perceived as a small pocket of real purchasing power reclaimed from currency melt. This perceptual frame gives the app a weight beyond what a US coupon app would have; it's closer to a mini-portfolio optimizer than a shopping helper.

---

## UX patterns for the "I won" moment

Observed patterns and their mechanisms, drawn from the competitor UX literature:

### The restrained in-moment confirmation

Honey's *moment-of-application* pattern (per the UX Collective 2019 critique and the Y Combinator thread) at its best is a small green banner that shows, briefly, the dollar amount saved and the code applied. At its worst it is a nagging interstitial. The **mechanism that works** is: (a) timed to the moment of maximum relevance — point of purchase, not discovery — (b) shows the specific number — not "savings applied!" but "$347 saved" — and (c) disappears on its own, no dismissal required. The *specific number* is the peak-end hit; the rest is noise.

Applied to our app: the "I won" moment is not at app-open. It is at the transition from *picking a play* to *committing to it* — opening the billetera, walking into the store, scanning the QR. The app should instrument this handoff. A confirmation-style reveal when the user taps "voy a comprar acá" is probably the structural peak.

### Apple Wallet — "this represents value" as a visual primitive

Apple's Wallet HIG (developer.apple.com/design/human-interface-guidelines/wallet) is instructive less for its content and more for its *visual grammar*. Wallet treats each card as a **physical-feeling object**: a single color-field, a brand logo, a single prominent number (balance, points), and nothing else. The card carries *presence* — it feels like it has weight. The Pratt design critique (ixd.prattsi.org) notes Wallet under-differentiates card types, but the underlying primitive — "each asset is a solid-colored rectangle with one number that matters" — is a strong pattern for representing **each wallet as a thing the user owns that has current capability**.

Mechanism: users need to feel they *have inventory*. The app's "billeteras" section should probably feel like Wallet's card stack — tangible, owned, finite — rather than a list of checkboxes. This feeds the "winning with my tools" mental model.

### Loyalty/streak patterns — mostly don't, carefully yes

Nike Run Club and Starbucks Rewards (cfcs.co.in/us/blog/top-gamified-loyalty-programs-usa, markhub24.com/post/gamification-in-marketing) use streaks, levels, and achievement badges. For a **savings tracker**, the pattern partially applies but has a failure mode: users who *didn't* use a deal this month feel scolded by a "0 pesos saved this week 😔" dashboard. The gamification-anxiety inversion.

The adaptable pattern: a **running monthly/annual total** ("Este año ahorraste $47.300") is observed to be motivating without scolding, because it frames the app's existence itself as the win — the user isn't being *asked* to do more, they're being *shown* what they've already done. This maps to Starbucks' implicit running-stars-total, which is ambient rather than nagging.

The anti-pattern to avoid: streak-shaming, push notifications ("¡Te perdiste 3 promos esta semana!"), and anything that frames missed savings as failure. For a loss-averse user, these notifications amplify the *pain* of missing out and degrade the app's net emotional balance.

### Progress/goal framing — use with extreme care

"Podrías ahorrar $10.000 más si activaras Naranja X" has a 50/50 chance of landing as *helpful tip* or *guilt trip*. The difference is almost entirely about tone and frequency. The research we reviewed did not produce a clean resolution; this is a synthesis judgment call.

The safer pattern is **passive surfacing**: when the user is already looking at a merchant, mention calmly that wallet X would have won here. Do not surface it unprompted across the app ("¡Oportunidad perdida!"). One-shot, contextual, opt-outable.

---

## First-tap experience

### Entry vectors

From the user's brief and the reddit community behavior, we can infer the dominant entry vectors:

1. **"I'm at the register / about to pay"** — the highest-stakes moment. User needs: which of my wallets wins for *this specific merchant*, right now.
2. **"I'm deciding where to go"** — planning mode. User needs: given my category (supermarket, pharmacy, restaurant), which merchants have active promos today that I can use.
3. **"I just got paid / the month started"** — strategy mode. User needs: what's the landscape this month, which wallets should I prioritize activating.
4. **"Pure browsing"** — deal-community mode. User needs: what's new, what's unusual, what should I know.

The NN/g "5 Types of E-commerce Shoppers" framework (nngroup.com/videos/5-types-e-commerce-shoppers) maps roughly onto this: our user is primarily a "product-focused" and "bargain hunter," not a browser or one-time. Optimize the first two entry vectors; the others are secondary.

### Smart defaults

NN/g's ecommerce homepages/listing-pages research (nngroup.com/articles/ecommerce-homepages-listing-pages) and the "5 E-commerce shoppers" framework imply: for a returning user, the first screen should be **already-answered-for-their-context**, not a form. Entry vector 1 (at the register) is best served by a default view sorted to "today's best plays, ranked," with the user's wallets pre-selected from prior use.

For a **new user**, the cold-start problem is real: the app doesn't know their wallets yet. The Hick's-Law-sensitive resolution is a single-step onboarding that presents the ~10-15 most-relevant AR wallets (MODO, Cuenta DNI, MP, Ualá, Naranja X, Galicia Move, Santa Fe Fiel, BBVA Go, ICBC Mobile, Santander, Supervielle, Macro, Brubank, Personal Pay, Astropay, Lemon) as checkable cards, with a "skip" option that shows unfiltered promos. Never gate access to *any* result on selecting wallets — respect that some users arrive curious, not committed.

Wallet selection should persist and be re-editable later; that is NN/g's "respect prior inputs" axiom.

### Filter fatigue thresholds

NN/g's filter research (nngroup.com/articles/filter-categories-values) plus the Loranger simplicity paper suggest the ceiling: mobile users tolerate roughly 3-5 top-level filters before abandonment. Above that, filters become a cognitive toll gate.

The three filters that matter for this app, judging from the community discussions:
1. **Wallets I own** (the core)
2. **Category** (supermarket, pharmacy, gastronomy, clothing, services, combustible) — with high power (a supermarket-only view is a common entry)
3. **Day/time** (today, this weekend, this week)

Everything else (tope range, minimum percentage, specific merchant search) should be accessible but not primary. A secondary-level "Filtros avanzados" drawer is NN/g-recommended pattern for this tier.

One caveat: **search** is not a filter, it's an entry mode. A user at a specific merchant ("will Carrefour give me a deal today with my wallets?") wants to type the merchant name, not filter. Search-first entry should be a persistent, prominent affordance — probably the second-most-prominent element after the default ranked list.

---

## Trust and transparency

### Freshness signaling research

We did not find a tight NN/g study on freshness-timestamps in aggregators specifically, but the adjacent literature (lusha.com/blog/what-data-freshness-claims-actually-mean, montecarlodata.com/blog-stale-data, tacnode.io/post/what-is-stale-data) and the TripAdvisor aggregator discussion surfaced consistent themes:

1. **Absolute timestamps outperform relative ones for trust** ("Verificado 16/04 17:23" > "Verificado hace 2 días"). Relative labels read slightly evasive; absolute timestamps read auditable.
2. **Per-record freshness beats global freshness**. One "Última actualización: hoy" at the top of the app is weaker than each promo carrying its own last-verified date, because users correctly intuit that not all data is updated at once.
3. **Freshness-claim inflation erodes trust quickly.** If "verified 2 hours ago" shows for a promo that turns out to be wrong, the next "verified 2 hours ago" is discounted. Honest uncertainty ("Fuente: Banco X, 12/04. Puede haber cambiado — verificá en la app del banco") builds more compound trust than confident-but-sometimes-wrong claims.
4. **Users value freshness signals asymmetrically**: the presence of a recent timestamp is lightly positive; the presence of a stale timestamp is strongly negative. This is the loss-aversion pattern again. Missing timestamps are often read as "probably stale."

Practical design implication: the app should show a per-promo freshness, use absolute timestamps, and probably age out promos visually (grayed after N days without re-verification) rather than hide them. The user wants to see "we last confirmed this on 12/04" and decide for themselves.

### Legal disclaimer perception — local read

The disclaimer *"Información referencial, verificá en la entidad emisora"* is a standard and necessary legal formulation in the AR financial context. It appears on every major bank promo page (observed in the Reddit threads where users screenshot bank promos with the disclaimer attached). Its local perception is closer to **honest hedge** than to **cover-your-ass**, for three reasons:

1. AR consumers are acculturated to reading these disclaimers — they appear in every TV ad, every SMS promo, every bank push notification. They are normalized.
2. The register ("verificá en la entidad emisora") is in voseo — it reads as a friendly advisory, not a corporate shield. Compare to an imagined Spanish-of-Spain "verifique en la entidad emisora" which would feel more bureaucratic.
3. In an environment where promo terms change mid-month, this phrase is aligned with user reality — they already *know* they need to verify in their own bank app. The disclaimer earns trust because it matches the user's own mental model.

Risk zones:
- If the disclaimer is the only thing users see and it's prominent (modal, center of screen), it reads defensive — "this app is not confident in its data."
- If it's hidden deep in footers, it reads evasive.
- The observed sweet spot (in Mercado Pago's legal copy, bank apps, and the r/DescuentosArgentina community norm) is **compact, inline, near the promo detail, un-emphasized but findable**. A secondary-text line under the merchant detail. Not scary, not hidden.

A meaningful additional trust lever: **naming the source specifically** ("Fuente: Cuenta DNI app — sección Descuentos"). Users in r/DescuentosArgentina regularly specify "en la app del banco lo veo así" when confirming promos; our app can borrow that specificity.

---

## Implications for the synthesis agent

Questions the synthesis agent should answer (not questions for me to answer):

1. **What is the app's primary surface on cold start vs. returning user?** This determines whether onboarding gates the answer or skips to it. The research strongly suggests skipping.

2. **Is the "best play" a single answer, a top-3, or a ranked list with a hero?** The deal-hunter mental model wants one answer; Hick's Law and satisfaction research back this; but the user's own brief says "sort by tope" which suggests a list. Reconcile.

3. **Where does the "I won" moment happen architecturally?** It is probably not the home screen; it's probably the transition to commit ("voy para allá" / "activar esta promo"). What is the visual vocabulary of that moment, and how restrained?

4. **How do we surface tope semantics without mental math?** Tope is *the* core concept but it's unintuitive. Do we show "hasta $X de reintegro" as the headline number? Do we compute expected savings for a user-specified spend? Default spend amounts?

5. **Voseo is mandatory, but how much warmth?** MP's register is the safe baseline; r/DescuentosArgentina's register is warmer and more fluent but can tip into slang. Where on that spectrum does this brand sit?

6. **Wallet representation: Apple-Wallet-card or checklist?** Both are valid; they imply different mental models. Wallet-card = "these are my things, with weight." Checklist = "these are filters." The former is probably better for the "winning with my tools" framing but is more visual real estate.

7. **Freshness: per-promo timestamp visible by default, or on-hover/on-tap?** The research says visible-by-default builds trust; design minimalism pushes toward on-tap. The tension is real.

8. **Running savings total — visible, celebratory, ambient, or opt-in?** Nike-style visible can motivate; Starbucks-style ambient is safer; opt-in is most conservative. Depends on intended long-term engagement model.

9. **Notifications — do they exist?** The loss-aversion research says push notifications about missed deals will hurt more than help. But a single "deal ending in 2 hours that you were about to miss" is genuinely useful. Design the narrowest possible notification scope.

10. **Category taxonomy** — AR-specific categories (gastronomía, supermercados, farmacias, indumentaria, combustible, servicios) vs. international defaults (food, shopping, fuel). Mapping should follow local convention, not translate from English.

---

## References (sources)

### Behavioral economics / psychology

- Kahneman, D., & Tversky, A. (1979). *Prospect Theory: An Analysis of Decision under Risk.* Econometrica.
  - https://en.wikipedia.org/wiki/Prospect_theory
  - https://www.press.umich.edu/pdf/0472108670-02.pdf
  - https://fas-polisci.rutgers.edu/levy/articles/1992%20Prospect%20Theory%20-%20Intro.pdf
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC9601776/
- Thaler, R. H. (1983, 1985). *Transaction Utility Theory.*
  - https://newristics.com/heuristics-biases/transactional-utility
  - https://www.nobelprize.org/uploads/2018/06/advanced-economicsciences2017.pdf
  - Darke & Dahl, "Fairness and Discounts: The Subjective Value of a Bargain" — https://myscp.onlinelibrary.wiley.com/doi/10.1207/S15327663JCP1303_13
- Shampanier, K., Mazar, N., & Ariely, D. (2007). *Zero as a Special Price: The True Value of Free Products.* Marketing Science.
  - https://thedecisionlab.com/reference-guide/psychology/zero-price-effect
  - https://people.duke.edu/~dandan/webfiles/PapersPI/Zero%20as%20a%20Special%20Price.pdf
- Hossain, M., & Saini, R. (2015). *Free indulgences: Enhanced zero-price effect for hedonic options.* International Journal of Research in Marketing.
  - https://www.sciencedirect.com/science/article/pii/S0167811615001172
- Kahneman, D., & Fredrickson, B. L. (1993). *When More Pain Is Preferred to Less: Adding a Better End.* Psychological Science (peak-end rule origin).
- Mental accounting — https://thedecisionlab.com/biases/mental-accounting

### UX research

- Nielsen Norman Group — *Simplicity Wins over Abundance of Choice* (Loranger, 2015): https://www.nngroup.com/articles/simplicity-vs-choice/
- Nielsen Norman Group — *The Peak–End Rule: How Impressions Become Memories* (Kane, 2018): https://www.nngroup.com/articles/peak-end-rule/
- Nielsen Norman Group — *Helpful Filter Categories and Values for Better UX*: https://www.nngroup.com/articles/filter-categories-values/
- Nielsen Norman Group — *UX Guidelines for Ecommerce Homepages, Category Pages, and Product Listing Pages*: https://www.nngroup.com/articles/ecommerce-homepages-listing-pages/
- Nielsen Norman Group — *UX Guidelines for Ecommerce Product Pages*: https://www.nngroup.com/articles/ecommerce-product-pages/
- Nielsen Norman Group — *Comparison Tables for Products, Services, and Features*: https://www.nngroup.com/articles/comparison-tables/
- Nielsen Norman Group — *Choice Overload (video)*: https://www.nngroup.com/videos/choice-overload/
- Nielsen Norman Group — *5 Types of E-commerce Shoppers (video)*: https://www.nngroup.com/videos/5-types-e-commerce-shoppers/
- Laws of UX — *Hick's Law*: https://lawsofux.com/hicks-law/
- Laws of UX — *Peak-End Rule*: https://lawsofux.com/peak-end-rule/
- Medium — *68% of Users Abandon Tasks Due to Decision Fatigue*: https://medium.com/@claus.nisslmueller/68-of-users-abandon-tasks-due-to-decision-fatigue-heres-how-to-fix-it-ac3b5dcc2ed8
- UXmatters — *Design for Fingers, Touch, and People*: https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php

### Competitor UX criticism

- UX Collective — *The obscure side of Honey*: https://uxdesign.cc/the-dark-side-of-honey-07a09efc7eaa
- Y Combinator thread on Honey post-exposé: https://news.ycombinator.com/item?id=43538113
- Apple Wallet HIG: https://developer.apple.com/design/human-interface-guidelines/wallet
- Apple Wallet Developer Guide: https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html
- Pratt design critique — Apple Wallet: https://ixd.prattsi.org/2024/09/design-critique-apple-wallet-ios-app-2/
- Gamified loyalty programs USA (Nike Run Club, Starbucks): https://www.cfcs.co.in/us/blog/top-gamified-loyalty-programs-usa
- Gamification in marketing (Nike Run Club case): https://www.markhub24.com/post/gamification-in-marketing-turning-engagement-into-loyalty

### Dark patterns / fake urgency

- Krakendata — *Urgency and Scarcity Messaging: Real-World Examples*: https://www.krakendata.com/blog/urgency-and-scarcity-messaging-real-world-examples/
- Meg Brunson — *Artificial Urgency: Fake Deadlines Hurt Trust*: https://megbrunson.com/artificial-urgency/
- Growth Suite — *Scarcity Marketing: Real vs. Fake Urgency*: https://www.growthsuite.net/resources/shopify-discount/scarcity-marketing-time-limited-discounts
- Deceptive Design catalog — *Fake urgency*: https://www.deceptive.design/types/fake-urgency

### Argentine context — language

- Spanish Linguist — *Fun with "voseo" in Argentina: Part 2* (2024): https://spanishlinguist.us/2024/08/fun-with-voseo-in-argentina-part-2/
- Spanish Mindset — *Argentinian Spanish Survival Guide*: https://spanish-mindset.com/2025/08/17/argentinian-spanish-survival-guide-speak-like-a-local-fast/
- Easy Argentine Spanish — *The Complete Beginner's Guide to Spanish Voseo*: https://easyargentinespanish.com/voseo/
- Discover Discomfort — *Argentinian Spanish Differences*: https://discoverdiscomfort.com/argentinian-spanish-differences/
- RAE — *Crónica de la lengua española 2023/2024* (on voseo standardization): https://www.rae.es/sites/default/files/2024-09/Cronica%20de%20la%20lengua%20espanola%202023_2024_web.pdf

### Argentine context — economy

- BBVA Research — *Argentina: The 2025 inflation was the lowest in 8 years*: https://www.bbvaresearch.com/en/publicaciones/argentina-the-2025-inflation-was-the-lowest-in-8-years/
- Reuters — *Argentina inflation is forecast to have ended 2025 at more than seven-year low*: https://www.reuters.com/world/americas/argentina-inflation-is-forecast-have-ended-2025-more-than-seven-year-low-2026-01-12/
- Yahoo Finance — *Argentina credit stress deepens as inflation and utility costs hit*: https://finance.yahoo.com/economy/articles/argentina-credit-stress-deepens-inflation-090420535.html
- Trading Economics — *Argentina Inflation Rate*: https://tradingeconomics.com/argentina/inflation-cpi
- Americas Quarterly — *Argentina: A 2025 Snapshot*: https://www.americasquarterly.org/article/argentina-a-2025-snapshot/

### Argentine deal-hunter community

- r/DescuentosArgentina — *Descuentos por pago con QR de MODO*: https://www.reddit.com/r/DescuentosArgentina/comments/1j7gbdy/descuentos_por_pago_con_qr_de_modo/
- r/DescuentosArgentina — *Mejor billetera virtual para descuentos o reintegros*: https://www.reddit.com/r/DescuentosArgentina/comments/1kdbusb/mejor_billtera_virtual_para_descuentos_o/
- r/DescuentosArgentina — *Les funcionan los reintegros de MODO*: https://www.reddit.com/r/DescuentosArgentina/comments/1gmlxdq/les_funcionan_los_reintegros_de_modo/
- r/DescuentosArgentina — *25% de reintegro con tope de 10k por Banco con Modo*: https://www.reddit.com/r/DescuentosArgentina/comments/1g1ji0h/25_de_reintegro_con_tope_de_10k_por_banco_con/
- r/DescuentosArgentina — *Mejor app o banco para descuento en mayorista*: https://www.reddit.com/r/DescuentosArgentina/comments/1f7z00v/mejor_app_o_banco_para_descuento_en_mayorista/
- r/AskArgentina — *Qué le gana a las billeteras virtuales*: https://www.reddit.com/r/AskArgentina/comments/1sg9z3r/que_le_gana_a_las_billeteras_virtuales/
- r/AskArgentina — *Tips financieros para el argentino (ratón) promedio*: https://www.reddit.com/r/AskArgentina/comments/1s6vg0a/tips_financieros_para_el_argentino_raton_promedio/
- r/AskArgentina — *Cuál billetera virtual usan para tener rendimientos*: https://www.reddit.com/r/AskArgentina/comments/1qqdehh/cual_billetera_virtual_usan_para_tener/
- r/merval — *Billeteras Virtuales en Argentina*: https://www.reddit.com/r/merval/comments/1kd40r5/billeteras_virtuales_en_argentina_me_estoy/

### Freshness / trust

- Lusha — *What data freshness claims actually mean*: https://www.lusha.com/blog/what-data-freshness-claims-actually-mean/
- Monte Carlo — *Stale Data Explained*: https://www.montecarlodata.com/blog-stale-data/
- Tacnode — *What is Stale Data*: https://tacnode.io/post/what-is-stale-data
