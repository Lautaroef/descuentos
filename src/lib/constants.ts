// Canonical slug sets and human labels for filters, SEO pages, and sitemap.
// Keep in lock-step with db/migrations/001_init.sql and scripts/promo-schema.ts.

import type { Category, Wallet } from './schema';

// ---------------------------------------------------------------------------
// Categories — category enum (see schema).
// ---------------------------------------------------------------------------

export const CATEGORY_SLUGS: Category[] = [
  'supermercado',
  'farmacia',
  'gastronomia',
  'combustible',
  'transporte',
  'indumentaria',
  'electro',
  'otro',
];

export const CATEGORY_LABELS: Record<Category, string> = {
  supermercado: 'Supermercado',
  farmacia: 'Farmacia',
  gastronomia: 'Gastronomía',
  combustible: 'Combustible',
  transporte: 'Transporte',
  indumentaria: 'Indumentaria',
  electro: 'Electro',
  otro: 'Otros',
};

// ---------------------------------------------------------------------------
// Wallets — aligns with the `wallet` enum in the Promo schema.
// ---------------------------------------------------------------------------

export const WALLET_SLUGS: Wallet[] = [
  'modo',
  'mercadopago',
  'cuentadni',
  'uala',
  'naranjax',
  'personalpay',
  'brubank',
  'bna_plus',
  'prex',
  'yoy',
  'buepp',
  'lemon',
  'astropay',
  'reba',
  'comunidad_coto',
  'jumbo_mas',
  'mi_carrefour',
];

export const WALLET_LABELS: Record<Wallet, string> = {
  modo: 'MODO',
  mercadopago: 'Mercado Pago',
  cuentadni: 'Cuenta DNI',
  uala: 'Ualá',
  naranjax: 'Naranja X',
  personalpay: 'Personal Pay',
  brubank: 'Brubank',
  bna_plus: 'BNA+',
  prex: 'Prex',
  yoy: 'Yoy',
  buepp: 'BueppPay',
  lemon: 'Lemon',
  astropay: 'AstroPay',
  reba: 'Reba',
  comunidad_coto: 'Comunidad Coto',
  jumbo_mas: 'Jumbo+',
  mi_carrefour: 'Mi Carrefour',
};

// ---------------------------------------------------------------------------
// Issuer banks — lowercase short names as produced by the MODO extractor prompt
// (scripts/lib/modo-extract.ts). This list is the ceiling for /banco/[slug] SEO pages.
// Discovered set from the live Phase 1 ingest (40 rows):
//   nacion, macro, icbc, santander, comafi, galicia, ciudad, bbva, supervielle,
//   sanjuan, yoy, santafe, santacruz, entrerios, credicoop, buepp, bancor,
//   bancodelsol, columbia, corrientes, bica, bancomunicipalderosario, patagonia,
//   bancoprovincianeuquen
// ---------------------------------------------------------------------------

export const BANK_SLUGS = [
  'nacion',
  'galicia',
  'bbva',
  'santander',
  'macro',
  'icbc',
  'supervielle',
  'credicoop',
  'ciudad',
  'bancor',
  'comafi',
  'columbia',
  'entrerios',
  'santafe',
  'sanjuan',
  'santacruz',
  'bancodelsol',
  'corrientes',
  'bica',
  'buepp',
  'yoy',
  'patagonia',
  'bancomunicipalderosario',
  'bancoprovincianeuquen',
] as const;

export type BankSlug = (typeof BANK_SLUGS)[number];

export const BANK_LABELS: Record<BankSlug, string> = {
  nacion: 'Banco Nación',
  galicia: 'Banco Galicia',
  bbva: 'BBVA',
  santander: 'Santander',
  macro: 'Banco Macro',
  icbc: 'ICBC',
  supervielle: 'Supervielle',
  credicoop: 'Credicoop',
  ciudad: 'Banco Ciudad',
  bancor: 'Banco de Córdoba',
  comafi: 'Banco Comafi',
  columbia: 'Banco Columbia',
  entrerios: 'Banco Entre Ríos',
  santafe: 'Banco Santa Fe',
  sanjuan: 'Banco San Juan',
  santacruz: 'Banco Santa Cruz',
  bancodelsol: 'Banco del Sol',
  corrientes: 'Banco Corrientes',
  bica: 'Banco Bica',
  buepp: 'BueppPay',
  yoy: 'Yoy',
  patagonia: 'Banco Patagonia',
  bancomunicipalderosario: 'Banco Municipal de Rosario',
  bancoprovincianeuquen: 'Banco Provincia Neuquén',
};

export function isBankSlug(slug: string): slug is BankSlug {
  return (BANK_SLUGS as readonly string[]).includes(slug);
}

export function isCategorySlug(slug: string): slug is Category {
  return (CATEGORY_SLUGS as readonly string[]).includes(slug);
}

export function isWalletSlug(slug: string): slug is Wallet {
  return (WALLET_SLUGS as readonly string[]).includes(slug);
}

// ---------------------------------------------------------------------------
// Regions — ISO 3166-2:AR codes. The UI exposes a small set for v1; expand when
// more regional promos show up.
// ---------------------------------------------------------------------------

export const REGION_OPTIONS = [
  { slug: 'AR', label: 'Todo el país' },
  { slug: 'CABA', label: 'CABA' },
  { slug: 'AR-B', label: 'Buenos Aires (GBA)' },
  { slug: 'AR-S', label: 'Santa Fe' },
  { slug: 'AR-X', label: 'Córdoba' },
  { slug: 'AR-E', label: 'Entre Ríos' },
  { slug: 'AR-J', label: 'San Juan' },
  { slug: 'AR-W', label: 'Corrientes' },
] as const;

// ---------------------------------------------------------------------------
// Day-of-week filter.
//   - `hoy`    → today's ISO weekday (0 = Sunday)
//   - `manana` → tomorrow's
//   - a single number 0-6 → that specific weekday
//   - `cualquiera` → no filter (default)
// ---------------------------------------------------------------------------

export const DAY_SHORT_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;
export const DAY_LONG_LABELS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

// Disclaimer text (Ley 24.240 mitigation per docs/architecture.md + context.md).
export const DISCLAIMER_TEXT =
  'Información referencial. Verificá los términos en la entidad emisora.';

export const FRESHNESS_DAYS = 3;
