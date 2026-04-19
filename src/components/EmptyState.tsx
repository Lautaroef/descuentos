import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';

interface EmptyStateProps {
  headline: string;
  subcopy?: string;
  cta?: { label: string; href?: string; onClick?: () => void };
}

/**
 * Typographic empty state with a single Lucide `ShoppingCart` icon (per
 * direction.md illustration rules + task-level D3 fallback). Reused across
 * all empty states in v1.
 */
export function EmptyState({ headline, subcopy, cta }: EmptyStateProps) {
  return (
    <div className="mx-auto flex max-w-[320px] flex-col items-center py-12 text-center">
      <ShoppingCart
        aria-hidden="true"
        strokeWidth={1.5}
        className="text-text-muted"
        style={{ width: 120, height: 120 }}
      />
      <h2 className="mt-4 text-lg font-semibold leading-7 tracking-[-0.01em] text-text-primary">
        {headline}
      </h2>
      {subcopy && (
        <p className="mt-2 text-sm font-medium leading-5 text-text-secondary">{subcopy}</p>
      )}
      {cta && (
        cta.href ? (
          <Link
            href={cta.href}
            className="mt-4 inline-flex items-center rounded-sm border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-[150ms] hover:border-border-strong"
          >
            {cta.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={cta.onClick}
            className="mt-4 inline-flex items-center rounded-sm border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-[150ms] hover:border-border-strong"
          >
            {cta.label}
          </button>
        )
      )}
    </div>
  );
}
