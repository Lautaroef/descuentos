'use client';

// SpendChip — subtle chip above the FilterBar that captures the user's
// planned spend for the week. Pressing the chip reveals an inline numeric
// input (never a modal) that confirms on Enter, cancels on Escape, saves on
// blur, and exposes a "Quitar" affordance to clear the value.
//
// The chip transforms in place per direction.md (motion: 150ms ease-out, no
// layout shift). Persistence is dual:
//   - URL param `?spend=30000` wins for shareable links / SSR truth.
//   - localStorage mirror under `SPEND_STORAGE_KEY` for returning visits.
//
// Default state is `spend === 0` ("opt in to effective savings"). The chip
// chooses its copy (empty vs set) based on the current URL param.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Wallet, X } from 'lucide-react';
import { SPEND_STORAGE_KEY } from '@/lib/constants';
import { parseSpendParam } from '@/lib/filters';

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

export function SpendChip() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlSpend = useMemo(
    () => parseSpendParam(searchParams.get('spend')),
    [searchParams],
  );

  const [editing, setEditing] = useState(false);
  // Input buffer. Only commits to URL on Enter / blur; Escape discards.
  const [draft, setDraft] = useState<string>('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Hydrate from localStorage when URL has no spend param.
  // URL wins: if ?spend=... is present we never overwrite it.
  useEffect(() => {
    const raw = searchParams.get('spend');
    if (raw !== null && raw !== '') return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(SPEND_STORAGE_KEY);
    } catch {
      return;
    }
    if (!stored) return;
    const parsed = parseSpendParam(stored);
    if (parsed <= 0) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set('spend', String(parsed));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEditor() {
    setDraft(urlSpend > 0 ? String(urlSpend) : '');
    setEditing(true);
    // Defer focus to the next tick so the input exists.
    queueMicrotask(() => inputRef.current?.focus());
  }

  function commit(nextValue: number) {
    const p = new URLSearchParams(searchParams.toString());
    if (nextValue > 0) {
      p.set('spend', String(nextValue));
      try {
        localStorage.setItem(SPEND_STORAGE_KEY, String(nextValue));
      } catch {
        /* localStorage disabled — URL is still truth */
      }
    } else {
      p.delete('spend');
      try {
        localStorage.removeItem(SPEND_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function saveDraft() {
    const parsed = parseSpendParam(draft);
    commit(parsed);
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveDraft();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }

  function remove() {
    commit(0);
    setEditing(false);
  }

  // --- Display ---------------------------------------------------------------

  if (editing) {
    return (
      <div
        role="group"
        aria-label="Editar presupuesto"
        className="inline-flex items-center gap-2 rounded-pill border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-3 py-1.5 text-sm transition-colors duration-[150ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
      >
        <Wallet
          className="h-4 w-4 text-[color:var(--color-accent)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="text-[color:var(--color-accent)]">$</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft}
          onChange={(e) => {
            // Strip everything except digits — avoids comma/period ambiguity.
            const digits = e.target.value.replace(/\D/g, '');
            setDraft(digits);
          }}
          onKeyDown={handleKey}
          onBlur={() => {
            // Blur from a button inside the group shouldn't trigger save.
            // Schedule microtask so Reset/Save click handlers can run first.
            queueMicrotask(() => {
              if (!editing) return;
              saveDraft();
            });
          }}
          aria-label="Presupuesto en pesos"
          placeholder="30000"
          className="w-24 bg-transparent font-semibold text-[color:var(--color-accent)] outline-none placeholder:font-medium placeholder:text-[color:var(--color-text-muted)]"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={saveDraft}
          className="rounded-sm px-2 py-0.5 text-xs font-semibold text-[color:var(--color-accent-ink)] bg-[color:var(--color-accent)] transition-colors duration-[150ms] hover:bg-[color:var(--color-accent-hover)]"
        >
          Listo
        </button>
        {urlSpend > 0 && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={remove}
            aria-label="Quitar presupuesto"
            className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium text-text-muted transition-colors duration-[150ms] hover:text-text-primary"
          >
            <X className="h-3 w-3" aria-hidden="true" strokeWidth={2} />
            Quitar
          </button>
        )}
      </div>
    );
  }

  if (urlSpend > 0) {
    return (
      <button
        type="button"
        onClick={openEditor}
        aria-label={`Presupuesto actual: ${ARS.format(urlSpend)}. Tocá para editar.`}
        className="inline-flex items-center gap-2 rounded-pill border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-3 py-1.5 text-sm font-semibold text-[color:var(--color-accent)] transition-all duration-[150ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[color:var(--color-accent-soft)] hover:brightness-[0.98] active:scale-[0.98]"
      >
        <Wallet
          className="h-4 w-4"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span>{ARS.format(urlSpend)}</span>
        <span aria-hidden="true" className="text-xs font-medium">
          ▾
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openEditor}
      aria-label="Ingresá tu presupuesto para ordenar por lo que te ahorrás"
      className="inline-flex items-center gap-2 rounded-pill border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-all duration-[150ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-border-strong hover:text-text-primary active:scale-[0.98]"
    >
      <Wallet
        className="h-4 w-4 text-text-muted"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span>Ingresá tu presupuesto</span>
    </button>
  );
}
