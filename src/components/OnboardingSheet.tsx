'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { isWalletSlug } from '@/lib/constants';
import { WalletPicker, buildDefaultPickerItems } from './WalletPicker';

const ONBOARD_KEY = 'descuentos-ar:onboarded';
const WALLET_STORAGE_KEY = 'descuentos-ar:owned-wallets';
const BANK_STORAGE_KEY = 'descuentos-ar:owned-banks';

/**
 * First-visit onboarding — warm bottom sheet. Paper-feel, low-stakes,
 * skippable. Per components.md §3 and ia.md §Onboarding flow redesign.
 *
 * The sheet fades in 600ms after mount (feels like an offer, not a gate),
 * sits over a warm semi-opaque backdrop, and never blocks the list behind it.
 *
 * Picker surface: reuses `<WalletPicker>` with the default wallet+bank catalog,
 * including search, "Seleccionar todos" / "Deseleccionar", and grouped tiles
 * ("Billeteras virtuales" / "Bancos tradicionales"). Tile logos resolve via
 * the shared favicon pipeline in `src/lib/logos.ts`.
 */
export function OnboardingSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Partition once per render — avoids re-splitting on every save.
  const items = useMemo(() => buildDefaultPickerItems(), []);
  const walletSlugs = useMemo(
    () => new Set(items.filter((i) => i.group === 'wallet').map((i) => i.slug)),
    [items],
  );

  useEffect(() => {
    try {
      const onboarded = localStorage.getItem(ONBOARD_KEY);
      if (onboarded) return;
    } catch {
      /* localStorage disabled — treat as not-onboarded */
    }
    setOpen(true);
    // Delay visibility so the user sees the product first; per D3 spec.
    const t = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') submit(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit(skip = false) {
    try {
      localStorage.setItem(ONBOARD_KEY, '1');
      if (!skip && selected.size > 0) {
        const wallets: string[] = [];
        const banks: string[] = [];
        for (const slug of selected) {
          if (walletSlugs.has(slug) && isWalletSlug(slug)) wallets.push(slug);
          else banks.push(slug);
        }

        if (wallets.length > 0) {
          localStorage.setItem(WALLET_STORAGE_KEY, wallets.join(','));
        }
        if (banks.length > 0) {
          localStorage.setItem(BANK_STORAGE_KEY, banks.join(','));
        }

        const p = new URLSearchParams(searchParams.toString());
        if (wallets.length > 0) p.set('wallet', wallets.join(','));
        if (banks.length > 0) p.set('issuer', banks.join(','));
        const qs = p.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open) return null;

  const disabled = selected.size === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => submit(true)}
        className={`absolute inset-0 bg-[rgba(20,17,12,0.32)] transition-opacity duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        className={`relative flex max-h-[min(90vh,720px)] w-full max-w-[520px] flex-col rounded-t-[16px] bg-surface shadow-3 transition-transform duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:mx-4 sm:rounded-[16px] ${
          visible ? 'translate-y-0' : 'translate-y-full sm:translate-y-0 sm:scale-[0.96] sm:opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={() => submit(true)}
          aria-label="Cerrar"
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-pill text-text-muted transition-colors duration-[150ms] hover:text-text-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="px-6 pt-6">
          <h2
            id="onboarding-title"
            className="text-[20px] font-semibold leading-7 tracking-[-0.01em] text-text-primary"
          >
            ¿Qué billeteras tenés?
          </h2>
          <p className="mt-1 text-sm font-medium text-text-secondary">
            Seleccioná las tuyas y te mostramos primero las promos que podés usar.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <WalletPicker selected={selected} onChange={setSelected} items={items} />
        </div>

        <div className="border-t border-divider px-6 pb-5 pt-4">
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={disabled}
            className={`w-full rounded-sm bg-[color:var(--color-accent)] px-6 py-3 text-base font-semibold text-[color:var(--color-accent-ink)] transition-colors duration-[150ms] hover:bg-[color:var(--color-accent-hover)] ${
              disabled ? 'opacity-40' : ''
            }`}
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => submit(true)}
            className="mt-3 w-full text-center text-sm font-medium text-text-muted underline-offset-4 transition-colors duration-[150ms] hover:text-text-primary hover:underline"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
