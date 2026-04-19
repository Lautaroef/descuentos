'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
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
 * First-visit onboarding. Asks the user which wallets they own. On submit, stores the
 * selection and pushes it into the URL as `?wallet=`. Skippable — dismissal marks the
 * user as onboarded either way so we don't nag on every visit.
 */
export function OnboardingSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<Wallet>>(new Set());

  useEffect(() => {
    try {
      const onboarded = localStorage.getItem(ONBOARD_KEY);
      if (!onboarded) setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-token bg-elevated p-5 shadow-2xl">
        <h2 className="mb-1 text-lg font-semibold">¿Qué billeteras usás?</h2>
        <p className="mb-4 text-sm tx-muted">
          Elegí tus billeteras para ver primero las promos que podés usar. Guardamos tu
          selección sólo en este dispositivo.
        </p>

        <div className="mb-5 flex flex-wrap gap-1.5">
          {WALLETS.map((w) => {
            const isOn = selected.has(w);
            return (
              <button
                key={w}
                type="button"
                onClick={() => {
                  const next = new Set(selected);
                  isOn ? next.delete(w) : next.add(w);
                  setSelected(next);
                }}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  isOn
                    ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)]'
                    : 'border-token bg-subtle tx-muted'
                }`}
                aria-pressed={isOn}
              >
                {WALLET_LABELS[w]}
              </button>
            );
          })}
        </div>

        <div className="flex justify-between gap-3">
          <button
            type="button"
            onClick={() => submit(true)}
            className="text-sm tx-dim underline underline-offset-4 hover:text-[color:var(--color-text)]"
          >
            Ahora no
          </button>
          <button
            type="button"
            onClick={() => submit(false)}
            className="rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--color-accent-contrast)] transition hover:opacity-90"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
