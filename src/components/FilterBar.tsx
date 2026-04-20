'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useMemo, useTransition, useEffect } from 'react';
import {
  CATEGORY_LABELS,
  CATEGORY_SLUGS,
  SPEND_STORAGE_KEY,
  WALLET_LABELS,
  WALLET_STORAGE_KEY,
} from '@/lib/constants';
import type { Category, Wallet } from '@/lib/schema';
import { SpendChip } from './SpendChip';

// Wallets we actively surface in the filter UI. Keep the list tight — the
// long-tail wallets from constants.ts become selectable once we have actual
// promos sourced for them.
const WALLETS_IN_UI: Wallet[] = [
  'modo',
  'mercadopago',
  'cuentadni',
  'uala',
  'naranjax',
  'personalpay',
  'brubank',
];

interface DayOption {
  value: string;
  label: string;
}

// Día chips, in spec order. `cualquiera` is the implicit default (no filter).
const DAY_OPTIONS: DayOption[] = [
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

export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Hydrate owned-wallet selection from localStorage if the URL has no wallet param yet.
  useEffect(() => {
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
    return { walletsSel, categoriesSel, day };
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
    if (next.has(w)) next.delete(w);
    else next.add(w);
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
    if (next.has(c)) next.delete(c);
    else next.add(c);
    const p = buildNextParams((x) => {
      const arr = [...next];
      if (arr.length) x.set('rubro', arr.join(','));
      else x.delete('rubro');
    });
    commit(p);
  }

  function toggleDay(value: string) {
    const p = buildNextParams((x) => {
      if (!value || value === 'cualquiera' || current.day === value) {
        x.delete('dia');
      } else {
        x.set('dia', value);
      }
    });
    commit(p);
  }

  function resetAll() {
    commit(new URLSearchParams());
    try {
      localStorage.removeItem(WALLET_STORAGE_KEY);
      localStorage.removeItem(SPEND_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  const hasSpend = (searchParams.get('spend') ?? '').length > 0;
  const anyActive =
    current.walletsSel.size > 0 ||
    current.categoriesSel.size > 0 ||
    current.day !== 'cualquiera' ||
    hasSpend;

  return (
    <div
      className={`flex flex-col gap-4 transition-opacity duration-[150ms] ${isPending ? 'opacity-70' : ''}`}
      aria-busy={isPending}
    >
      <div>
        <SpendChip />
      </div>

      <FilterGroup title="Billetera">
        <ChipRow>
          {WALLETS_IN_UI.map((w) => (
            <Chip
              key={w}
              selected={current.walletsSel.has(w)}
              onClick={() => toggleWallet(w)}
              label={WALLET_LABELS[w]}
            />
          ))}
        </ChipRow>
      </FilterGroup>

      <FilterGroup title="Rubro">
        <ChipRow>
          {CATEGORY_SLUGS.map((c) => (
            <Chip
              key={c}
              selected={current.categoriesSel.has(c)}
              onClick={() => toggleCategory(c)}
              label={CATEGORY_LABELS[c]}
            />
          ))}
        </ChipRow>
      </FilterGroup>

      <FilterGroup title="Día">
        <ChipRow>
          {DAY_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              selected={current.day === o.value}
              onClick={() => toggleDay(o.value)}
              label={o.label}
              ariaLabel={`Filtrar por día: ${o.label}`}
            />
          ))}
        </ChipRow>
      </FilterGroup>

      {anyActive && (
        <button
          onClick={resetAll}
          className="inline-flex w-max items-center gap-1.5 rounded-sm px-2 py-1 text-sm font-medium text-[color:var(--color-accent)] underline-offset-4 transition-colors duration-[150ms] hover:underline"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium tracking-[0.01em] text-text-muted">{title}</h3>
      {children}
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2 overflow-x-auto sm:flex-wrap">{children}</div>
  );
}

function Chip({
  selected,
  onClick,
  label,
  ariaLabel,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  ariaLabel?: string;
}) {
  const base =
    'inline-flex min-h-9 items-center gap-1 rounded-pill border px-3 py-1.5 text-sm transition-all duration-[150ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97]';
  const state = selected
    ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] font-semibold text-[color:var(--color-accent)]'
    : 'border-border bg-surface font-medium text-text-secondary hover:border-border-strong';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${state}`}
      aria-pressed={selected}
      aria-label={ariaLabel}
    >
      {label}
    </button>
  );
}
