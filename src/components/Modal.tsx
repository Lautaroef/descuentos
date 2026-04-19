'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { X, ExternalLink } from 'lucide-react';

interface ModalProps {
  /**
   * Main modal content. In intercepting-route mode this is the PromoDetail —
   * but the chrome itself is domain-agnostic.
   */
  children: React.ReactNode;
  /**
   * Accessible dialog title. Wired into `aria-labelledby` through a hidden
   * node; visible title rendering is the content's responsibility.
   */
  ariaLabel: string;
  /**
   * href for the "open in its own page" escape hatch (Ver página completa).
   * When provided, a small link renders top-right of the modal chrome. Voseo
   * copy is set by the caller.
   */
  fullPageHref?: string;
  /**
   * Voseo label for the full-page link. Defaults to "Ver página completa".
   */
  fullPageLabel?: string;
}

/**
 * Reusable modal chrome — overlay, focus trap, Esc-to-close, click-outside,
 * scroll-lock, near-fullscreen mobile / centered desktop. No UI library;
 * vanilla React + design tokens from `docs/design/system.md`.
 *
 * Close semantics: every closable action routes through `router.back()` so
 * the modal state is a tier of the browser history. This is the canonical
 * pattern for Next.js intercepting routes — the "away" direction is always
 * "go back to where the intercept fired." Direct URL access (where the
 * modal never mounted) falls through to the full page, not here.
 *
 * Motion (per `direction.md` / `system.md`):
 *   entrance: 220ms ease-out (`--duration-default` / `--ease-out`)
 *   exit:     180ms ease-out (clamped below default, feels crisp)
 *
 * Accessibility:
 *   - role="dialog" aria-modal="true"
 *   - Focus is moved to the close button on mount; previously-focused
 *     element is restored on unmount.
 *   - Tab / Shift+Tab are trapped inside the modal content.
 *   - Esc closes. Click-outside closes.
 *   - Body scroll is locked (width compensated to prevent layout shift).
 */
export function Modal({
  children,
  ariaLabel,
  fullPageHref,
  fullPageLabel = 'Ver página completa',
}: ModalProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // --- Close handler: navigate back so the browser restores list state ---
  const close = useCallback(() => {
    router.back();
  }, [router]);

  // --- Mount: save prior focus, focus the close button, lock scroll ---
  useEffect(() => {
    previousFocusRef.current = document.activeElement;

    // Focus the close button so keyboard users have a predictable anchor.
    const raf = requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    // Scroll-lock the body without shifting layout.
    const { body, documentElement } = document;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      cancelAnimationFrame(raf);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;

      // Restore focus to the element that triggered the modal (the card).
      // Guard: element might have unmounted (rare for SSR lists, defensive).
      const prior = previousFocusRef.current;
      if (prior instanceof HTMLElement && document.contains(prior)) {
        prior.focus();
      }
    };
  }, []);

  // --- Keyboard: Esc closes, Tab is trapped ---
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      // Collect focusable elements inside the modal in DOM order.
      const focusables = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close]);

  // --- Click-outside: backdrop click closes. Click on content does not. ---
  function onBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) close();
  }

  return (
    <div
      aria-hidden={false}
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6"
      data-testid="modal-root"
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onBackdropClick}
        data-testid="modal-backdrop"
        className="absolute inset-0 bg-[rgba(20,17,12,0.48)] animate-[modal-backdrop-in_var(--duration-default)_var(--ease-out)]"
      />

      {/* Container — fullscreen-ish on mobile, centered card on desktop */}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={onBackdropClick}
        className="relative z-[71] flex max-h-[100dvh] w-full max-w-[760px] items-end justify-center sm:items-start sm:pt-8"
      >
        <div
          className="relative flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full flex-col overflow-hidden bg-surface shadow-3 animate-[modal-panel-in_var(--duration-default)_var(--ease-out)] sm:max-h-[calc(100dvh-64px)] sm:rounded-[16px]"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            // Mobile: near-fullscreen, rounded only on top edges.
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          }}
        >
          {/* Top chrome: close (×) + optional "Ver página completa" link */}
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-surface/80 sm:px-6">
            <button
              ref={closeButtonRef}
              type="button"
              onClick={close}
              aria-label="Cerrar"
              data-testid="modal-close"
              className="inline-flex h-9 w-9 items-center justify-center rounded-pill text-text-muted transition-colors duration-[150ms] hover:bg-surface-sunken hover:text-text-primary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            {fullPageHref && (
              <Link
                href={fullPageHref}
                scroll={false}
                data-testid="modal-fullpage-link"
                className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium text-[color:var(--color-accent)] transition-colors duration-[150ms] hover:text-[color:var(--color-accent-hover)]"
              >
                {fullPageLabel}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>
            )}
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-0 pb-8">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
