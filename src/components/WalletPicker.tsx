'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { WALLET_LABELS, WALLET_SLUGS, BANK_LABELS, BANK_SLUGS } from '@/lib/constants';
import { walletLogoUrl, bankLogoUrl } from '@/lib/logos';
import type { Wallet } from '@/lib/schema';
import type { BankSlug } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A pickable item — wallet or bank. The `group` routes it into one of the two
 * sections ("Billeteras virtuales" / "Bancos tradicionales"). Logo is an
 * external URL (favicon resolver or curated override).
 */
export interface PickerItem {
  slug: string;
  label: string;
  logoUrl: string | null;
  group: 'wallet' | 'bank';
}

// ---------------------------------------------------------------------------
// Item catalog
// ---------------------------------------------------------------------------

/**
 * The default catalog — wallets from WALLET_SLUGS + banks from BANK_SLUGS.
 * Ordered roughly by adoption: MODO / Mercado Pago / Cuenta DNI / Ualá first,
 * then the long-tail. Banks in BANK_SLUGS order (usage-frequency descending).
 *
 * Bank labels are shortened where the `BANK_LABELS` version is long ("Banco
 * Comafi" → "Comafi", "Banco de Córdoba" → "Bancor") because tile width is
 * tight. The shortened display-label doesn't affect the underlying slug or
 * data.
 */
const BANK_TILE_LABELS: Partial<Record<BankSlug, string>> = {
  nacion: 'Nación',
  galicia: 'Galicia',
  macro: 'Macro',
  ciudad: 'Ciudad',
  credicoop: 'Credicoop',
  supervielle: 'Supervielle',
  comafi: 'Comafi',
  columbia: 'Columbia',
  entrerios: 'Entre Ríos',
  santafe: 'Santa Fe',
  sanjuan: 'San Juan',
  santacruz: 'Santa Cruz',
  bancodelsol: 'Del Sol',
  corrientes: 'Corrientes',
  bica: 'Bica',
  patagonia: 'Patagonia',
  bancomunicipalderosario: 'Muni. Rosario',
  bancoprovincianeuquen: 'BPN Neuquén',
  bancor: 'Bancor',
};

export function buildDefaultPickerItems(): PickerItem[] {
  const wallets: PickerItem[] = WALLET_SLUGS.map((slug) => ({
    slug,
    label: WALLET_LABELS[slug],
    logoUrl: walletLogoUrl(slug),
    group: 'wallet',
  }));

  const banks: PickerItem[] = BANK_SLUGS
    // Skip slugs that collide with wallets (e.g. "yoy", "buepp") — those render
    // in the wallet section and don't need to appear twice.
    .filter((slug) => !(WALLET_SLUGS as readonly string[]).includes(slug))
    .map((slug) => ({
      slug,
      label: BANK_TILE_LABELS[slug] ?? BANK_LABELS[slug],
      logoUrl: bankLogoUrl(slug),
      group: 'bank',
    }));

  return [...wallets, ...banks];
}

// ---------------------------------------------------------------------------
// WalletPicker
// ---------------------------------------------------------------------------

interface WalletPickerProps {
  /** Selected slugs. Controlled — caller owns state. */
  selected: Set<string>;
  /** Called when selection changes. Always receives a fresh Set. */
  onChange: (next: Set<string>) => void;
  /** Optional custom catalog. Defaults to wallets + banks from constants. */
  items?: PickerItem[];
  /** Optional custom group labels. Voseo copy must match direction.md. */
  labels?: {
    wallets: string;
    banks: string;
    searchPlaceholder: string;
    selectAll: string;
    deselectAll: string;
    emptyMatches: string;
  };
}

const DEFAULT_LABELS = {
  wallets: 'Billeteras virtuales',
  banks: 'Bancos tradicionales',
  searchPlaceholder: 'Buscar billetera o banco…',
  selectAll: 'Seleccionar todos',
  deselectAll: 'Deseleccionar',
  emptyMatches: 'No encontramos nada con ese nombre.',
} as const;

/**
 * Reusable wallet + bank picker. Surfaces:
 *   - Search input that filters tiles across both groups
 *   - "Seleccionar todos" / "Deseleccionar" quick toggles
 *   - Two grouped grids (wallets / banks) with logo-above-name tiles
 *
 * Used by OnboardingSheet (first-visit) and intended for reuse in a future
 * "Editar billeteras" settings entry from the NavBar.
 *
 * Design notes (direction.md + ia.md + components.md):
 *   - Selected: 1.5px accent border, accent-soft fill, accent ink.
 *   - Unselected: 1px border, surface fill, text-secondary ink.
 *   - Tile radius: 10px (--radius-md — data surface, not a pill).
 *   - Search input: rounded-sm (6px), text-base body, 44px height.
 *   - Motion: 150ms tap feedback, consistent with FilterBar chips.
 *   - Voseo mandatory: "Seleccioná", "Buscá", "Deseleccionar" (never "todos
 *     deseleccionados" — noun forms read as system-speak).
 */
export function WalletPicker({
  selected,
  onChange,
  items,
  labels,
}: WalletPickerProps) {
  const allItems = useMemo(() => items ?? buildDefaultPickerItems(), [items]);
  const [query, setQuery] = useState('');

  const L = { ...DEFAULT_LABELS, ...labels };

  const normalizedQuery = query.trim().toLowerCase();

  const visibleItems = useMemo(() => {
    if (!normalizedQuery) return allItems;
    return allItems.filter((item) =>
      item.label.toLowerCase().includes(normalizedQuery) ||
      item.slug.toLowerCase().includes(normalizedQuery),
    );
  }, [allItems, normalizedQuery]);

  const walletItems = visibleItems.filter((i) => i.group === 'wallet');
  const bankItems = visibleItems.filter((i) => i.group === 'bank');

  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every((i) => selected.has(i.slug));
  const anyVisibleSelected = visibleItems.some((i) => selected.has(i.slug));

  function toggle(slug: string) {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onChange(next);
  }

  function selectAllVisible() {
    const next = new Set(selected);
    for (const item of visibleItems) next.add(item.slug);
    onChange(next);
  }

  function deselectAllVisible() {
    const next = new Set(selected);
    for (const item of visibleItems) next.delete(item.slug);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
          strokeWidth={1.75}
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={L.searchPlaceholder}
          aria-label={L.searchPlaceholder}
          className="h-11 w-full rounded-sm border border-border bg-surface pl-10 pr-3 text-base font-medium text-text-primary transition-colors duration-[150ms] placeholder:text-text-muted focus:border-[color:var(--color-border-strong)] focus:outline-none"
        />
      </div>

      {/* Quick toggles */}
      <div className="flex items-center gap-2 text-sm font-medium">
        <button
          type="button"
          onClick={selectAllVisible}
          disabled={allVisibleSelected}
          className="rounded-sm px-2 py-1 text-[color:var(--color-accent)] underline-offset-4 transition-colors duration-[150ms] hover:underline disabled:cursor-default disabled:text-text-muted disabled:no-underline"
        >
          {L.selectAll}
        </button>
        <span className="text-text-muted" aria-hidden="true">·</span>
        <button
          type="button"
          onClick={deselectAllVisible}
          disabled={!anyVisibleSelected}
          className="rounded-sm px-2 py-1 text-[color:var(--color-accent)] underline-offset-4 transition-colors duration-[150ms] hover:underline disabled:cursor-default disabled:text-text-muted disabled:no-underline"
        >
          {L.deselectAll}
        </button>
      </div>

      {/* Wallets section */}
      {walletItems.length > 0 && (
        <PickerSection label={L.wallets} items={walletItems} selected={selected} onToggle={toggle} />
      )}

      {/* Banks section */}
      {bankItems.length > 0 && (
        <PickerSection label={L.banks} items={bankItems} selected={selected} onToggle={toggle} />
      )}

      {/* Empty search result */}
      {visibleItems.length === 0 && (
        <p className="py-6 text-center text-sm font-medium text-text-muted">{L.emptyMatches}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PickerSection + PickerTile
// ---------------------------------------------------------------------------

function PickerSection({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string;
  items: PickerItem[];
  selected: Set<string>;
  onToggle: (slug: string) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.04em] text-text-muted">
        {label}
      </h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((item) => (
          <PickerTile
            key={item.slug}
            item={item}
            selected={selected.has(item.slug)}
            onClick={() => onToggle(item.slug)}
          />
        ))}
      </div>
    </section>
  );
}

function PickerTile({
  item,
  selected,
  onClick,
}: {
  item: PickerItem;
  selected: boolean;
  onClick: () => void;
}) {
  // Voseo aria-label: "Seleccionar Modo" / "Deseleccionar Modo".
  const aria = `${selected ? 'Deseleccionar' : 'Seleccionar'} ${item.label}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={aria}
      className={`flex h-[88px] flex-col items-center justify-center gap-1 rounded-md border bg-surface p-2 text-center transition-all duration-[150ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] ${
        selected
          ? 'border-[1.5px] border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]'
          : 'border-border hover:border-border-strong'
      }`}
    >
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-white"
        aria-hidden="true"
      >
        {item.logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.logoUrl}
            alt=""
            width={36}
            height={36}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-9 w-9 object-contain"
          />
        ) : (
          <span className="text-[15px] font-semibold text-text-secondary">
            {item.label.charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      <span
        className={`line-clamp-1 w-full text-xs font-medium ${
          selected ? 'text-[color:var(--color-accent)]' : 'text-text-primary'
        }`}
      >
        {item.label}
      </span>
    </button>
  );
}
