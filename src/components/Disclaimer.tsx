// Disclaimer footer — quiet, always-present, voseo. Per components.md §7.

interface DisclaimerProps {
  /** 'home' or 'detail'. Detail gets boxed + merchant-specific line. */
  variant?: 'home' | 'detail';
  /** Detail only — merchant name for the non-affiliation disclaimer. */
  merchant?: string;
}

export function Disclaimer({ variant = 'home', merchant }: DisclaimerProps) {
  if (variant === 'detail') {
    return (
      <div className="mt-6 rounded-md bg-surface-sunken p-4 text-xs leading-[18px] font-medium text-text-whisper">
        <p>Información referencial. Verificá los términos en la entidad emisora antes de comprar.</p>
        {merchant && (
          <p className="mt-2">
            No estamos afiliados a {merchant} ni a ninguna de las entidades emisoras. Los
            términos completos pueden variar o actualizarse sin previo aviso.
          </p>
        )}
      </div>
    );
  }
  return (
    <footer className="mt-12 border-t border-border pt-6 text-xs leading-[18px] font-medium text-text-whisper">
      <p>Información referencial. Verificá los términos en la entidad emisora antes de comprar.</p>
      <p className="mt-1">
        Datos tomados de fuentes públicas. No estamos afiliados a ningún banco ni billetera.
      </p>
    </footer>
  );
}
