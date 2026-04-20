// P0 regression — the detail-page hero must render the FINAL tope in the
// server-side HTML, not the animation's starting value.
//
// Audit (`docs/design/ux-audit.md` finding 17): every /p/[id] page had shipped
// SSR HTML reading `$ 0 tope máximo` — the count-up component's initial state
// was `0`, so first paint + no-JS + pre-hydration all showed zero as the hero.
// Fix/lock: `useState<number>(value)` so SSR prints the real tope; the 0→final
// animation only runs inside `useEffect`, which never executes on the server.
//
// We assert SSR directly via `renderToString` (the same code path Next.js uses
// for the initial HTML) because `@testing-library/react`'s `render` runs
// effects in happy-dom, which would mask the very regression this locks in.
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PromoHero } from './PromoHero';
import { makePromo, SIN_TOPE_PROMO } from '../../tests/fixtures/promo-fixtures';

describe('PromoHero — SSR hero value', () => {
  it('server-rendered HTML contains the real tope, never $ 0', () => {
    const promo = makePromo({ tope: 30_000, tope_period: 'month', pct: 25 });

    const html = renderToString(<PromoHero promo={promo} />);

    // Tope rendered as ARS currency via Intl (non-breaking space tolerant).
    expect(html).toMatch(/\$\s*30\.000/);
    // Explicit guard against the historical regression: the literal "$ 0" must
    // NOT appear anywhere in the server HTML for a non-zero promo.
    expect(html).not.toMatch(/\$\s*0(?!\d)/);
    // "tope máximo" label still rendered (we're not breaking copy).
    expect(html).toContain('tope máximo');
  });

  it('server HTML for a sin-tope promo says "Sin tope", not $ 0', () => {
    const html = renderToString(<PromoHero promo={SIN_TOPE_PROMO} />);
    expect(html).toContain('Sin tope');
    expect(html).not.toMatch(/\$\s*0(?!\d)/);
  });

  it('renders a non-$0 hero across a range of tope values', () => {
    for (const tope of [5_000, 25_000, 60_000, 250_000]) {
      const html = renderToString(
        <PromoHero promo={makePromo({ tope, tope_period: 'month' })} />,
      );
      // Each value must render in the SSR hero, not zero.
      const pretty = new Intl.NumberFormat('es-AR').format(tope);
      expect(html, `tope=${tope} must render in SSR`).toMatch(
        new RegExp(`\\$\\s*${pretty.replace('.', '\\.')}`),
      );
    }
  });
});
