'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Promo } from '@/lib/schema';
import { PromoCard } from './PromoCard';
import { EmptyState } from './EmptyState';

interface PromoListProps {
  promos: Promo[];
  /**
   * Planned spend (integer ARS). Forwarded to each PromoCard so the
   * hero flips to `Te ahorrás $X` when > 0. Defaults to 0.
   */
  spend?: number;
}

/**
 * The main grid. Splits tope-having promos from "sin tope" — the latter get a
 * collapsible section so they don't pollute the sort-by-tope ranking
 * (product.md wedge, components.md §8).
 */
export function PromoList({ promos, spend = 0 }: PromoListProps) {
  const withTope = promos.filter((p) => p.tope !== null);
  const noTope = promos.filter((p) => p.tope === null);

  const [expanded, setExpanded] = useState(false);

  if (promos.length === 0) {
    return (
      <EmptyState
        headline="No hay promos con esos filtros hoy."
        subcopy="Probá aflojar alguno y te mostramos más."
      />
    );
  }

  return (
    <>
      {withTope.length > 0 && (
        <ul
          role="list"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Promos con tope, ordenadas por monto mayor"
        >
          {withTope.map((p) => (
            <li key={p.id}>
              <PromoCard promo={p} spend={spend} />
            </li>
          ))}
        </ul>
      )}

      {noTope.length > 0 && (
        <section className="mt-12 border-t border-border pt-6">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between text-base font-semibold text-text-primary transition-colors duration-[150ms] hover:text-[color:var(--color-accent)]"
            aria-expanded={expanded}
          >
            <span>
              {noTope.length} {noTope.length === 1 ? 'promo' : 'promos'} sin tope declarado
            </span>
            <ChevronDown
              className={`h-4 w-4 text-text-muted transition-transform duration-[220ms] ease-[cubic-bezier(0.65,0,0.35,1)] ${expanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          {expanded && (
            <>
              <p className="mt-4 text-sm font-medium text-text-secondary">
                Estas promos no declaran un tope máximo. Todo tu consumo suma al reintegro.
              </p>
              <ul
                role="list"
                className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                aria-label="Promos sin tope"
              >
                {noTope.map((p) => (
                  <li key={p.id}>
                    <PromoCard promo={p} spend={spend} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  );
}
