// First-letter avatar fallback for merchants. No logo-fetching pipeline in v1.

interface MerchantAvatarProps {
  name: string;
  size?: number;
}

export function MerchantAvatar({ name, size = 32 }: MerchantAvatarProps) {
  const initial = (name.trim().charAt(0) || '?').toUpperCase();
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
