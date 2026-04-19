'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

const INSTALL_DISMISSED_KEY = 'descuentos-ar:install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Global NavBar. Sticky, `--color-bg` with 1px bottom border. Wordmark on the
 * left + optional Install PWA pill on the right. Per components.md §5.
 */
export function NavBar() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(INSTALL_DISMISSED_KEY) === '1') {
        setDismissed(true);
      }
    } catch {
      /* ignore */
    }
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function handleInstall() {
    if (!installEvent) return;
    void installEvent.prompt();
    void installEvent.userChoice.then(() => {
      setInstallEvent(null);
    });
  }

  function handleDismiss() {
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  const showInstall = installEvent !== null && !dismissed;

  return (
    <header
      className="sticky top-0 z-[40] border-b border-border bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/80"
    >
      <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="text-[20px] font-semibold tracking-[-0.015em] text-text-primary"
        >
          Descuentos
        </Link>
        {showInstall && (
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={handleInstall}
              className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors duration-[150ms] hover:border-border-strong"
            >
              <Download className="h-3 w-3" aria-hidden="true" />
              Instalar app
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Descartar instalación"
              className="inline-flex h-7 w-7 items-center justify-center rounded-pill text-text-muted transition-colors duration-[150ms] hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
