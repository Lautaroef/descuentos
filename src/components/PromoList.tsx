'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Promo } from '@/lib/schema';
import { PromoCard } from './PromoCard';

interface PromoListProps {
  promos: Promo[];
}

/**
 * The main grid. Splits tope-having promos from "sin tope" — the latter get a collapsible
 * section so they don't pollute the sort-by-tope ranking (product.md wedge).
 */
export function PromoList({ promos }: PromoListProps) {
  const withTope = promos.filter((p) => p.tope !== null);
  const noTope = promos.filter((p) => p.tope === null);

  const [expanded, setExpanded] = useState(false);

  if (promos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-token bg-subtle/50 p-8 text-center">
        <p className="text-sm tx-muted">
          No hay promos que coincidan con tus filtros. Probá aflojar alguno.
        </p>
      </div>
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
              <PromoCard promo={p} />
            </li>
          ))}
        </ul>
      )}

      {noTope.length > 0 && (
        <section className="mt-6 rounded-2xl border border-token bg-subtle/50">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium tx-muted transition hover:text-[color:var(--color-text)]"
            aria-expanded={expanded}
          >
            <span>
              {noTope.length} {noTope.length === 1 ? 'promo' : 'promos'} sin tope declarado
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
          {expanded && (
            <ul
              role="list"
              className="grid grid-cols-1 gap-3 border-t border-token p-4 sm:grid-cols-2 lg:grid-cols-3"
              aria-label="Promos sin tope"
            >
              {noTope.map((p) => (
                <li key={p.id}>
                  <PromoCard promo={p} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
