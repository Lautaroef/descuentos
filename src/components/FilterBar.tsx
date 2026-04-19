'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useMemo, useTransition, useEffect, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import {
  CATEGORY_LABELS,
  CATEGORY_SLUGS,
  REGION_OPTIONS,
  WALLET_LABELS,
} from '@/lib/constants';
import type { Category, Wallet } from '@/lib/schema';

// Wallets we actively surface in the filter UI. Keep the list tight — the long-tail wallets
// from constants.ts become selectable once we have actual promos sourced for them (Phase 3).
const WALLETS_IN_UI: Wallet[] = [
  'modo',
  'mercadopago',
  'cuentadni',
  'uala',
  'naranjax',
  'personalpay',
  'brubank',
];

const DAY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'cualquiera', label: 'Cualquier día' },
  { value: 'hoy', label: 'Hoy' },
  { value: 'manana', label: 'Mañana' },
  { value: '1', label: 'Lunes' },
  { value: '2', label: 'Martes' },
  { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sábado' },
  { value: '0', label: 'Domingo' },
];

const WALLET_STORAGE_KEY = 'descuentos-ar:owned-wallets';

export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Hydrate owned-wallet selection from localStorage if the URL has no wallet param yet.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    const hasWallet = searchParams.get('wallet') ?? searchParams.get('banco');
    if (!hasWallet) {
      try {
        const stored = localStorage.getItem(WALLET_STORAGE_KEY);
        if (stored) {
          const walls = stored
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          if (walls.length > 0) {
            const p = new URLSearchParams(searchParams.toString());
            p.set('wallet', walls.join(','));
            router.replace(`${pathname}?${p.toString()}`, { scroll: false });
          }
        }
      } catch {
        /* localStorage disabled — no-op */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Parse current selections from the URL (SSR truth).
  const current = useMemo(() => {
    const getCsv = (k: string) =>
      (searchParams.get(k) ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    const walletsSel = new Set(getCsv('wallet').concat(getCsv('banco')));
    const categoriesSel = new Set(getCsv('rubro').concat(getCsv('categoria')));
    const day = searchParams.get('dia') ?? 'cualquiera';
    const region = searchParams.get('region') ?? 'AR';
    return { walletsSel, categoriesSel, day, region };
  }, [searchParams]);

  function buildNextParams(mutator: (p: URLSearchParams) => void): URLSearchParams {
    const p = new URLSearchParams(searchParams.toString());
    p.delete('banco'); // always rewrite onto the canonical `wallet` key
    p.delete('categoria'); // same for category alias
    mutator(p);
    return p;
  }

  function commit(p: URLSearchParams) {
    const qs = p.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    startTransition(() => router.push(url, { scroll: false }));
  }

  function toggleWallet(w: Wallet) {
    const next = new Set(current.walletsSel);
    next.has(w) ? next.delete(w) : next.add(w);
    const p = buildNextParams((x) => {
      const arr = [...next];
      if (arr.length) x.set('wallet', arr.join(','));
      else x.delete('wallet');
    });
    try {
      localStorage.setItem(WALLET_STORAGE_KEY, [...next].join(','));
    } catch {
      /* ignore */
    }
    commit(p);
  }

  function toggleCategory(c: Category) {
    const next = new Set(current.categoriesSel);
    next.has(c) ? next.delete(c) : next.add(c);
    const p = buildNextParams((x) => {
      const arr = [...next];
      if (arr.length) x.set('rubro', arr.join(','));
      else x.delete('rubro');
    });
    commit(p);
  }

  function setDay(value: string) {
    const p = buildNextParams((x) => {
      if (!value || value === 'cualquiera') x.delete('dia');
      else x.set('dia', value);
    });
    commit(p);
  }

  function setRegion(value: string) {
    const p = buildNextParams((x) => {
      if (!value || value === 'AR') x.delete('region');
      else x.set('region', value);
    });
    commit(p);
  }

  function resetAll() {
    commit(new URLSearchParams());
    try {
      localStorage.removeItem(WALLET_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  const anyActive =
    current.walletsSel.size > 0 ||
    current.categoriesSel.size > 0 ||
    current.day !== 'cualquiera' ||
    current.region !== 'AR';

  return (
    <div
      className={`flex flex-col gap-4 ${isPending ? 'opacity-70' : ''}`}
      aria-busy={isPending}
    >
      <FilterGroup title="Billetera">
        <div className="flex flex-wrap gap-1.5">
          {WALLETS_IN_UI.map((w) => (
            <Chip
              key={w}
              selected={current.walletsSel.has(w)}
              onClick={() => toggleWallet(w)}
              label={WALLET_LABELS[w]}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Rubro">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_SLUGS.map((c) => (
            <Chip
              key={c}
              selected={current.categoriesSel.has(c)}
              onClick={() => toggleCategory(c)}
              label={CATEGORY_LABELS[c]}
            />
          ))}
        </div>
      </FilterGroup>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FilterGroup title="Día">
          <select
            value={current.day}
            onChange={(e) => setDay(e.target.value)}
            className="w-full rounded-md border border-token bg-subtle px-3 py-2 text-sm"
            aria-label="Filtrar por día"
          >
            {DAY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FilterGroup>

        <FilterGroup title="Región">
          <select
            value={current.region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full rounded-md border border-token bg-subtle px-3 py-2 text-sm"
            aria-label="Filtrar por región"
          >
            {REGION_OPTIONS.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.label}
              </option>
            ))}
          </select>
        </FilterGroup>
      </div>

      {anyActive && (
        <button
          onClick={resetAll}
          className="inline-flex w-max items-center gap-1.5 rounded-md border border-token bg-subtle px-3 py-1.5 text-xs tx-muted transition hover:text-[color:var(--color-accent)]"
        >
          <RotateCcw className="h-3 w-3" /> Limpiar filtros
        </button>
      )}

      {/* Suppress unused import warning when hydration state isn't visually shown. */}
      <span hidden>{hydrated ? '' : ''}</span>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide tx-dim">{title}</h3>
      {children}
    </div>
  );
}

function Chip({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
        selected
          ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)]'
          : 'border-token bg-subtle tx-muted hover:text-[color:var(--color-text)]'
      }`}
      aria-pressed={selected}
    >
      {label}
      {selected && <X className="h-3 w-3" />}
    </button>
  );
}
