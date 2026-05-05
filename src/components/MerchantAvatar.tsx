'use client';

import { useState } from 'react';
import { merchantLogoUrl } from '@/lib/logos';

interface MerchantAvatarProps {
  name: string;
  size?: number;
}

/**
 * Merchant avatar — logo when we can resolve one, first-letter fallback when we
 * can't (generic merchants, unknown brands) or when the logo request fails.
 *
 * Layout contract: **fixed square slot** (size × size) regardless of what loads.
 * Preserves no-layout-shift guarantee spec'd in Job 1 — the slot reserves its
 * space before the image responds. An <img> tag (not next/image) is used so
 * Google's s2 → gstatic 301 redirect is followed natively by the browser and
 * so we can attach an onerror handler to downgrade to the first-letter state.
 *
 * Per direction.md §Imagery: 32×32 inside `--radius-sm` container,
 * `object-fit: contain`, no drop-shadow.
 */
export function MerchantAvatar({ name, size = 32 }: MerchantAvatarProps) {
  const logoUrl = merchantLogoUrl(name);
  const [failed, setFailed] = useState(false);

  const initial = (name.trim().charAt(0) || '?').toUpperCase();

  // When we have no logo, or a prior load failed, render the first-letter disc.
  if (!logoUrl || failed) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center justify-center rounded-pill bg-surface-sunken font-semibold text-text-secondary"
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.44),
          lineHeight: 1,
        }}
      >
        {initial}
      </span>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-border bg-surface"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Plain <img>: follows Google's 301 → gstatic transparently; no Next
          image config required. Fixed intrinsic dimensions prevent CLS.
          On load, downgrade to the letter avatar if the response was Google's
          generic 16×16 fallback (returned when the requested domain has no
          publishable favicon — looks worse than a clean first-letter disc). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth > 0 && img.naturalWidth < 32) {
            setFailed(true);
          }
        }}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </span>
  );
}
