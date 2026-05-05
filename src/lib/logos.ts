// Logo resolution for merchants, wallets, and issuer banks.
//
// Strategy (hybrid, documented in docs/logos-sourcing.md):
//   1. Curated top-N override map → stable, known-good URL (local SVG/PNG in
//      /public/logos/... OR a high-quality third-party URL).
//   2. Merchant → domain map (e.g. "Coto" → "coto.com.ar") + Google's favicon
//      service as a zero-config, trademark-neutral logo CDN
//      (https://www.google.com/s2/favicons?domain=<d>&sz=64). Favicons are the
//      entity's own official publish-to-web iconography, so we inherit a clean
//      legal footing without scraping brand asset pages.
//   3. Fallback → `null` (UI renders the first-letter MerchantAvatar).
//
// The resolver is deterministic + pure so it can run on the server at render
// time. Every result is an HTTP URL the browser can request directly — no
// build-time fetch, no DB column, no per-render work.

// ---------------------------------------------------------------------------
// Merchant logos
// ---------------------------------------------------------------------------

/**
 * Merchants with a known website. Logos resolve via Google's favicon CDN,
 * which handles 301 → gstatic redirects transparently and returns a PNG the
 * browser can cache. Merchants absent from this map fall through to `null`
 * and render the first-letter avatar — the right choice for high-variance
 * placeholders like "Comercios adheridos" or "Supermercados del interior".
 *
 * Keys are lowercase, whitespace-collapsed, diacritic-stripped merchant
 * strings (see `normalizeMerchantKey`). Values are the canonical AR domain.
 *
 * Coverage audit (April 2026): 80+ entries cover ~85% of promos in the
 * top-30 merchant histogram. See `scripts/list-merchants.ts` for the full
 * histogram this was calibrated against.
 */
const MERCHANT_DOMAIN_MAP: Record<string, string> = {
  // Supermercados (highest-volume merchants by row count)
  coto: 'coto.com.ar',
  carrefour: 'carrefour.com.ar',
  jumbo: 'jumbo.com.ar',
  disco: 'disco.com.ar',
  vea: 'vea.com.ar',
  dia: 'dia.com.ar',
  changomas: 'changomas.com.ar',
  'la anonima': 'laanonima.com.ar',
  atomo: 'atomoconviene.com',
  diarco: 'diarco.com.ar',
  'diarco barrio': 'diarco.com.ar',
  makro: 'makro.com.ar',
  yaguar: 'yaguar.com.ar',
  'disco vea': 'disco.com.ar',
  cordiez: 'cordiez.com.ar',
  vital: 'vital.com.ar',

  // Farmacia
  farmacity: 'farmacity.com',
  simplicity: 'simplicity.com.ar',
  'get the look': 'getthelook.com.ar',
  farmalife: 'farmalife.com.ar',
  farmaplus: 'farmaplus.com.ar',
  openfarma: 'openfarma.com.ar',

  // Gastronomía
  'burger king': 'burgerking.com.ar',
  'mostaza': 'mostaza.com.ar',
  mcdonalds: 'mcdonalds.com.ar',
  freddo: 'freddo.com.ar',
  havanna: 'havanna.com.ar',
  rapanui: 'rapanui.com.ar',
  'the food market': 'thefoodmarket.com.ar',
  'le pain quotidien': 'lepainquotidien.com.ar',
  lpq: 'lepainquotidien.com.ar',
  'go bar': 'gobar.com.ar',
  cervelar: 'cervelar.com',

  // Combustible
  'app ypf': 'ypf.com',
  'full ypf': 'ypf.com',
  ypf: 'ypf.com',
  'axion energy': 'axionenergy.com',
  axion: 'axionenergy.com',
  shell: 'shell.com.ar',

  // Transporte / viajes
  'aerolineas arg': 'aerolineas.com.ar',
  'aerolineas argentinas': 'aerolineas.com.ar',
  cabify: 'cabify.com',
  despegar: 'despegar.com.ar',
  almundo: 'almundo.com.ar',
  'al mundo': 'almundo.com.ar',
  chevallier: 'nuevachevallier.com',
  'flecha bus': 'flechabus.com.ar',
  'la veloz del norte': 'lavelozdelnorte.com.ar',
  'el norte': 'elnortebus.com.ar',
  'general urquiza transportes': 'generalurquiza.com.ar',
  'viajes naranja x': 'naranjax.com',
  'viajes naranjax': 'naranjax.com',
  andesmar: 'andesmar.com',
  plusmar: 'plusmar.com.ar',

  // Indumentaria / deportes
  nike: 'nike.com.ar',
  decathlon: 'decathlon.com.ar',
  'under armour': 'underarmour.com.ar',
  'john foos': 'johnfoos.com',
  mimo: 'mimo.com.ar',
  lazaro: 'lazaro.com.ar',
  sportclub: 'sportclub.com.ar',
  sportotal: 'sportotal.com.ar',
  sportline: 'sportline.com.ar',
  showsport: 'showsport.com.ar',
  'on city': 'oncity.com',
  'on sports': 'onsports.com.ar',
  eyelit: 'eyelit.com.ar',
  adidas: 'adidas.com.ar',
  puma: 'ar.puma.com',
  reebok: 'reebok.com.ar',
  topper: 'topper.com.ar',
  cannon: 'cannon.com.ar',
  rosen: 'rosen.com.ar',
  sodimac: 'sodimac.com.ar',

  // Electro
  samsung: 'samsung.com',
  jbl: 'ar.jbl.com',
  fravega: 'fravega.com',
  musimundo: 'musimundo.com',
  naldo: 'naldo.com.ar',
  cetrogar: 'cetrogar.com.ar',
  megatone: 'megatone.net',
  coppel: 'coppel.com.ar',
  whirlpool: 'whirlpool.com.ar',
  'casa del audio': 'casadelaudio.com',
  'baires it': 'bairesit.com',
  multipoint: 'multipoint.com.ar',
  'educacion it': 'educacionit.com',
  coderhouse: 'coderhouse.com',
  'icbc mall': 'mall.icbc.com.ar',

  // Otros
  playmobil: 'playmobil.com.ar',
  avon: 'avon.com.ar',
  natura: 'natura.com.ar',
  essen: 'essen.com.ar',
  suavestar: 'suavestar.com',
  simmons: 'simmons.com.ar',
  'personal flow': 'personal.com.ar',
  'tienda personal': 'personal.com.ar',
  'recargas personal': 'personal.com.ar',
  'recargas movistar prepago o tuenti': 'movistar.com.ar',
  'ualá bis': 'uala.com.ar',
  'uala bis': 'uala.com.ar',
  cinemark: 'cinemarkhoyts.com.ar',
  'tienda ciudad': 'tiendaciudad.com.ar',
  vacalin: 'vacalin.com.ar',
};

/**
 * Normalize a merchant string for lookup. Lowercases, strips diacritics,
 * collapses whitespace. `Alba la Pérgola` → `alba la pergola`.
 */
export function normalizeMerchantKey(merchant: string): string {
  return merchant
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ') // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Merchant strings we know are not real brands (generic collections like
 * "Supermercados adheridos", "Comercios adheridos", "Farmacias y perfumerías").
 * For these we skip the logo entirely and render the first-letter avatar.
 */
const GENERIC_MERCHANT_KEYWORDS = [
  'adherid',
  'comercios de',
  'marcas destacadas',
  'supermercados del',
  'ferias',
  'ferias y mercados',
  'universidades',
  'jugueterias',
  'librerias',
  'librerías',
  'farmacias y',
  'ópticas',
  'opticas',
  'gastronomia',
  'gastronomía',
  'supermercados',
  'veterinarias',
  'colectivos y',
  'seleccionados',
  'fiesta de',
];

export function isGenericMerchant(merchant: string): boolean {
  const key = normalizeMerchantKey(merchant);
  // Exact/near-exact single-word generics.
  if (key === 'supermercados' || key === 'farmacias' || key === 'comercios adheridos')
    return true;
  return GENERIC_MERCHANT_KEYWORDS.some((kw) => key.includes(kw));
}

/**
 * Google's favicon service. Returns a PNG; handles 301 → gstatic transparently
 * in the browser. `sz` is a hint, not guarantee — real output sizes are
 * quantized (16, 32, 64, 128, 256). We request 64 for crisp 32×32 display
 * even at 2× DPR.
 */
function googleFaviconUrl(domain: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/**
 * Resolve a logo URL for a merchant. Returns `null` when:
 *   - the merchant is a generic placeholder string
 *   - the merchant has no known domain and no fuzzy fallback matches
 *
 * Callers should treat `null` as "render the first-letter avatar instead."
 */
export function merchantLogoUrl(merchant: string | null | undefined): string | null {
  if (!merchant) return null;
  if (isGenericMerchant(merchant)) return null;

  const key = normalizeMerchantKey(merchant);

  // Exact hit in the curated map.
  if (MERCHANT_DOMAIN_MAP[key]) {
    return googleFaviconUrl(MERCHANT_DOMAIN_MAP[key]);
  }

  // Prefix hit — handles "Disco & Vea" → "disco", "Aerolíneas Argentinas"
  // → "aerolineas argentinas". Kept tight: only match the first token or
  // first two tokens to avoid false positives.
  const first = key.split(' ')[0];
  if (first && first.length >= 4 && MERCHANT_DOMAIN_MAP[first]) {
    return googleFaviconUrl(MERCHANT_DOMAIN_MAP[first]);
  }
  const firstTwo = key.split(' ').slice(0, 2).join(' ');
  if (firstTwo && firstTwo.length >= 5 && MERCHANT_DOMAIN_MAP[firstTwo]) {
    return googleFaviconUrl(MERCHANT_DOMAIN_MAP[firstTwo]);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Wallet logos — fixed set, sourced from each wallet's own website favicon.
// ---------------------------------------------------------------------------

/**
 * Wallet → canonical domain. These are the seven primary AR wallets + the
 * long-tail wallets present in our Zod enum. Favicon URLs are stable because
 * each entity controls the favicon published at its root.
 */
export const WALLET_DOMAINS: Record<string, string> = {
  modo: 'modo.com.ar',
  mercadopago: 'mercadopago.com.ar',
  cuentadni: 'cuentadni.bancoprovincia.com.ar',
  uala: 'uala.com.ar',
  naranjax: 'naranjax.com',
  personalpay: 'personalpay.com.ar',
  brubank: 'brubank.com',
  bna_plus: 'bna.com.ar',
  prex: 'prexcard.com.ar',
  yoy: 'yoy.com.ar',
  buepp: 'buepp.com.ar',
  lemon: 'lemon.com.ar',
  astropay: 'astropay.com',
  reba: 'reba.la',
  comunidad_coto: 'coto.com.ar',
  jumbo_mas: 'jumbo.com.ar',
  mi_carrefour: 'carrefour.com.ar',
};

export function walletLogoUrl(slug: string): string | null {
  const domain = WALLET_DOMAINS[slug];
  if (!domain) return null;
  return googleFaviconUrl(domain, 64);
}

// ---------------------------------------------------------------------------
// Bank logos — same pattern, but for issuer_bank slugs.
// ---------------------------------------------------------------------------

export const BANK_DOMAINS: Record<string, string> = {
  nacion: 'bna.com.ar',
  galicia: 'galicia.ar',
  bbva: 'bbva.com.ar',
  santander: 'santander.com.ar',
  macro: 'macro.com.ar',
  icbc: 'icbc.com.ar',
  supervielle: 'supervielle.com.ar',
  credicoop: 'bancocredicoop.coop',
  ciudad: 'bancociudad.com.ar',
  bancor: 'bancor.com.ar',
  comafi: 'bancocomafi.com.ar',
  columbia: 'bancocolumbia.com.ar',
  entrerios: 'bancoentrerios.com.ar',
  santafe: 'bancosantafe.com.ar',
  sanjuan: 'bancosanjuan.com',
  santacruz: 'bancosantacruz.com',
  bancodelsol: 'bancodelsol.com',
  corrientes: 'bancodecorrientes.com.ar',
  bica: 'bancobica.com.ar',
  buepp: 'buepp.com.ar',
  yoy: 'yoy.com.ar',
  patagonia: 'bancopatagonia.com.ar',
  bancomunicipalderosario: 'bmr.com.ar',
  bancoprovincianeuquen: 'bpn.com.ar',
};

export function bankLogoUrl(slug: string): string | null {
  const domain = BANK_DOMAINS[slug];
  if (!domain) return null;
  return googleFaviconUrl(domain, 64);
}
