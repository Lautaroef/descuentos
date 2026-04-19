// Presentation formatters — all es-AR, all UI-safe.

import { DAY_LONG_LABELS, DAY_SHORT_LABELS } from './constants';
import type { TopePeriod } from './schema';

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

export function formatTope(tope: number | null): string {
  if (tope === null) return 'Sin tope';
  return ARS.format(tope);
}

export function formatPct(pct: number): string {
  // PG numeric arrives as string from postgres-js (non-bigint mode). Coerce defensively.
  const n = typeof pct === 'string' ? Number(pct) : pct;
  return `${Math.round(n)}%`;
}

export function topePeriodLabel(period: TopePeriod | null | undefined): string {
  switch (period) {
    case 'month':
      return 'por mes';
    case 'week':
      return 'por semana';
    case 'day':
      return 'por día';
    case 'ticket':
      return 'por ticket';
    default:
      return '';
  }
}

/**
 * Render the `valid_days` set in plain Spanish.
 *
 *   [0,1,2,3,4,5,6]  → "Todos los días"
 *   [1,2,3,4,5]      → "Lunes a viernes"
 *   [0,6]            → "Fines de semana"
 *   [3]              → "Sólo los miércoles"
 *   [2,4]            → "Martes y jueves"
 *   []               → "Sin restricción de día"
 */
export function formatValidDays(days: number[]): string {
  if (!days || days.length === 0) return 'Sin restricción de día';
  const set = new Set(days);
  if (set.size === 7) return 'Todos los días';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Lunes a viernes';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Fines de semana';
  if (set.size === 1) return `Sólo los ${DAY_LONG_LABELS[[...set][0]].toLowerCase()}`;
  const labels = [...set].sort().map((d) => DAY_LONG_LABELS[d].toLowerCase());
  if (labels.length === 2) return `${capitalize(labels[0])} y ${labels[1]}`;
  return labels.map(capitalize).join(', ');
}

export function formatValidDaysShort(days: number[]): string {
  if (!days || days.length === 0) return '—';
  if (days.length === 7) return 'Todos los días';
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Lun–Vie';
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Sáb–Dom';
  return [...days].sort().map((d) => DAY_SHORT_LABELS[d]).join(', ');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * "Verificado hace X" in Spanish — relative-time without importing the ICU plural machinery.
 */
export function relativeSpanish(dateIso: string, now = new Date()): string {
  const then = new Date(dateIso).getTime();
  const diffMs = Math.max(0, now.getTime() - then);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'recién';
  if (mins < 60) return `hace ${mins} ${mins === 1 ? 'minuto' : 'minutos'}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
  const months = Math.floor(days / 30);
  return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
}

const SPANISH_DATE = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatDateShort(iso: string): string {
  // `valid_from` / `valid_to` arrive as YYYY-MM-DD; Date parses as UTC midnight,
  // then Intl renders in the runtime's TZ. For a plain date display we want the literal
  // calendar date, so reconstruct with UTC getters.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return SPANISH_DATE.format(
    new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}
