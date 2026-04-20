'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import {
  BANK_STORAGE_KEY,
  isWalletSlug,
  ONBOARD_STORAGE_KEY,
  SPEND_STORAGE_KEY,
  WALLET_STORAGE_KEY,
} from '@/lib/constants';
import { parseSpendParam } from '@/lib/filters';
import { WalletPicker, buildDefaultPickerItems } from './WalletPicker';

// Keep local aliases for the previous in-file names so tests + readers don't
// have to grep across files for what keys are in play.
const ONBOARD_KEY = ONBOARD_STORAGE_KEY;

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
  // Two-step flow: 'wallets' then 'spend'. Both are skippable independently.
  const [step, setStep] = useState<'wallets' | 'spend'>('wallets');
  const [spendDraft, setSpendDraft] = useState<string>('');

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

  /**
   * Persist state to localStorage + URL.
   *
   *   saveWallets=true  → write the current `selected` → wallet+bank localStorage
   *                       keys and `?wallet=`/`?issuer=` URL params.
   *   saveSpend=true    → write current `spendDraft` → spend localStorage key
   *                       and `?spend=` URL param (only if parseable to > 0).
   *
   * `close=true` dismisses the sheet. Used by the terminal actions; the
   * first-step `Guardar` persists wallets then advances to the spend step
   * WITHOUT closing.
   */
  function persistAndMaybeClose(opts: {
    saveWallets: boolean;
    saveSpend: boolean;
    close: boolean;
  }) {
    try {
      localStorage.setItem(ONBOARD_KEY, '1');

      const wallets: string[] = [];
      const banks: string[] = [];
      if (opts.saveWallets && selected.size > 0) {
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
      }

      const parsedSpend = opts.saveSpend ? parseSpendParam(spendDraft) : 0;
      if (parsedSpend > 0) {
        localStorage.setItem(SPEND_STORAGE_KEY, String(parsedSpend));
      }

      const touchedUrl =
        (opts.saveWallets && (wallets.length > 0 || banks.length > 0)) ||
        parsedSpend > 0;

      if (touchedUrl) {
        const p = new URLSearchParams(searchParams.toString());
        if (wallets.length > 0) p.set('wallet', wallets.join(','));
        if (banks.length > 0) p.set('issuer', banks.join(','));
        if (parsedSpend > 0) p.set('spend', String(parsedSpend));
        const qs = p.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    } catch {
      /* ignore */
    }
    if (opts.close) setOpen(false);
  }

  // Legacy alias so existing tests + call sites (Esc/backdrop/×) keep working.
  // `submit(true)` = pure dismiss, no persistence of selections.
  // `submit(false)` = step-appropriate save.
  function submit(skip = false) {
    if (skip) {
      try {
        localStorage.setItem(ONBOARD_KEY, '1');
      } catch {
        /* ignore */
      }
      setOpen(false);
      return;
    }
    if (step === 'wallets') {
      // Save wallets, then advance to the optional spend step.
      persistAndMaybeClose({ saveWallets: true, saveSpend: false, close: false });
      setStep('spend');
    } else {
      // Terminal spend step — save spend draft (if any) and close.
      persistAndMaybeClose({ saveWallets: false, saveSpend: true, close: true });
    }
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

        {step === 'wallets' && (
          <>
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
          </>
        )}

        {step === 'spend' && (
          <>
            <div className="px-6 pt-6">
              <h2
                id="onboarding-title"
                className="text-[20px] font-semibold leading-7 tracking-[-0.01em] text-text-primary"
              >
                ¿Cuánto pensás gastar esta semana en supermercado?
              </h2>
              <p className="mt-1 text-sm font-medium text-text-secondary">
                Es opcional. Si nos lo decís, ordenamos las promos por cuánto te ahorrás — no por el tope.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <label
                htmlFor="onboarding-spend-input"
                className="mb-2 block text-xs font-medium text-text-muted"
              >
                Presupuesto en pesos
              </label>
              <div className="flex items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2.5 transition-colors duration-[150ms] focus-within:border-[color:var(--color-border-strong)]">
                <span
                  aria-hidden="true"
                  className="text-base font-semibold text-text-secondary"
                >
                  $
                </span>
                <input
                  id="onboarding-spend-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={spendDraft}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    setSpendDraft(digits);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submit(false);
                    }
                  }}
                  placeholder="30000"
                  aria-label="Presupuesto en pesos"
                  className="h-6 w-full bg-transparent text-base font-semibold text-text-primary outline-none placeholder:font-medium placeholder:text-text-muted"
                />
              </div>
              <p className="mt-3 text-xs font-medium text-text-muted">
                Siempre lo podés cambiar o quitar arriba del listado.
              </p>
            </div>

            <div className="border-t border-divider px-6 pb-5 pt-4">
              <button
                type="button"
                onClick={() => submit(false)}
                className="w-full rounded-sm bg-[color:var(--color-accent)] px-6 py-3 text-base font-semibold text-[color:var(--color-accent-ink)] transition-colors duration-[150ms] hover:bg-[color:var(--color-accent-hover)]"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => {
                  // "Ahora no" on the spend step = skip the optional spend
                  // question. We still close the sheet and keep any wallet
                  // prefs saved from step 1.
                  setSpendDraft('');
                  persistAndMaybeClose({ saveWallets: false, saveSpend: false, close: true });
                }}
                className="mt-3 w-full text-center text-sm font-medium text-text-muted underline-offset-4 transition-colors duration-[150ms] hover:text-text-primary hover:underline"
              >
                Ahora no
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
