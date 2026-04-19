'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { WALLET_LABELS } from '@/lib/constants';
import type { Wallet } from '@/lib/schema';

const WALLETS: Wallet[] = [
  'modo',
  'mercadopago',
  'cuentadni',
  'uala',
  'naranjax',
  'personalpay',
  'brubank',
];

const ONBOARD_KEY = 'descuentos-ar:onboarded';
const WALLET_STORAGE_KEY = 'descuentos-ar:owned-wallets';

/**
 * First-visit onboarding — warm bottom sheet. Paper-feel, low-stakes,
 * skippable. Per components.md §3 and ia.md §Onboarding flow redesign.
 *
 * The sheet fades in 600ms after mount (feels like an offer, not a gate),
 * sits over a warm semi-opaque backdrop, and never blocks the list behind it.
 */
export function OnboardingSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<Set<Wallet>>(new Set());

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
        const arr = [...selected];
        localStorage.setItem(WALLET_STORAGE_KEY, arr.join(','));
        const p = new URLSearchParams(searchParams.toString());
        p.set('wallet', arr.join(','));
        router.replace(`${pathname}?${p.toString()}`, { scroll: false });
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
        className={`relative w-full max-w-[440px] rounded-t-[16px] bg-surface p-6 shadow-3 transition-transform duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:mx-4 sm:rounded-[16px] ${
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

        <h2
          id="onboarding-title"
          className="mb-1 text-[20px] font-semibold leading-7 tracking-[-0.01em] text-text-primary"
        >
          ¿Qué billeteras tenés?
        </h2>
        <p className="mb-6 text-sm font-medium text-text-secondary">
          Marcá las tuyas y te mostramos primero las promos que podés usar.
        </p>

        <div className="mb-6 flex flex-wrap gap-2">
          {WALLETS.map((w) => {
            const isOn = selected.has(w);
            return (
              <button
                key={w}
                type="button"
                onClick={() => {
                  const next = new Set(selected);
                  if (isOn) next.delete(w);
                  else next.add(w);
                  setSelected(next);
                }}
                className={`inline-flex min-h-11 items-center rounded-pill border px-4 py-2 text-sm transition-all duration-[150ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] ${
                  isOn
                    ? 'border-[1.5px] border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] font-semibold text-[color:var(--color-accent)]'
                    : 'border-border bg-surface font-medium text-text-secondary hover:border-border-strong'
                }`}
                aria-pressed={isOn}
              >
                {WALLET_LABELS[w]}
              </button>
            );
          })}
        </div>

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
  );
}
