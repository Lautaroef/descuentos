'use client';

// A small count-up component. Interpolates an integer from 0 to `value`
// over --duration-countup (480ms) with --ease-spring. Only runs once per
// promo id per session (sessionStorage-gated). Respects prefers-reduced-motion.
//
// Keep tiny — this is the single ceremonial animation in the app; no
// framer-motion dependency, no external libs.

import { useEffect, useRef, useState } from 'react';

interface CountUpNumberProps {
  /** Final numeric value to count up to (integer expected). */
  value: number;
  /** Session-unique key to prevent re-animating on navigation back. */
  sessionKey: string;
  /** Formatter applied at every frame — e.g. Intl.NumberFormat. */
  format: (n: number) => string;
  /** className applied to the inner span (for sizing/color). */
  className?: string;
}

const DURATION_MS = 480;
const SPRING = (t: number) => {
  // Approximate cubic-bezier(0.34, 1.56, 0.64, 1) — spring-ish.
  // Use a simple back-ease-out for a numeric interpolation; the CSS curve
  // is designed for transforms, here we just want a tiny overshoot feel.
  const c1 = 1.70158;
  const p = t - 1;
  return 1 + c1 * p * p * p + c1 * p * p;
};

export function CountUpNumber({
  value,
  sessionKey,
  format,
  className,
}: CountUpNumberProps) {
  const [display, setDisplay] = useState<number>(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let shouldAnimate = true;
    try {
      if (sessionStorage.getItem(sessionKey) === '1') shouldAnimate = false;
    } catch {
      /* ignore */
    }
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        shouldAnimate = false;
      }
    } catch {
      /* ignore */
    }
    if (!shouldAnimate) {
      setDisplay(value);
      return;
    }
    try {
      sessionStorage.setItem(sessionKey, '1');
    } catch {
      /* ignore */
    }
    const start = performance.now();
    setDisplay(0);
    function step(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / DURATION_MS);
      const eased = Math.max(0, Math.min(1, SPRING(t)));
      setDisplay(Math.round(value * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDisplay(value);
      }
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, sessionKey]);

  return <span className={className}>{format(display)}</span>;
}
