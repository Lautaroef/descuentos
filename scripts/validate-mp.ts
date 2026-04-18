// Validate: Mercado Pago Promociones
//
// Findings from probing:
// - WP root routes expose standard CPTs only (posts, pages, blocks, elementor_library).
// - Taxonomy `vendedores_category` is REST-exposed (8 categories, ~18 sellers total).
// - Post type `mp_vendedores` is registered but REST-gated (404 on /wp/v2/mp_vendedores
//   and mp/v1/sellers). /wp/v2/posts returns [].
// - Seller detail pages /seller/<slug>/ 301-redirect to the external merchant site.
// - Homepage HTML (gzip-compressed; must pass --compressed) DOES contain all 12 sellers
//   with pct, name, date range, description text — that's the only usable extraction path.
//
// Important: MP Promociones is an e-COMMERCE cuotas-sin-interés catalog, not a cashback-
// with-tope catalog. Most promos express "hasta N cuotas sin interés" and/or "hasta X% OFF".
// The Promo schema's tope/tope_period fields are always absent for MP.
import { writeFile } from 'node:fs/promises';
import { printCoverage, type CoverageReport } from './promo-schema.js';

const ROOT = 'https://promociones.mercadopago.com.ar/wp-json/wp/v2/';
const HOME = 'https://promociones.mercadopago.com.ar/';

async function getJson(url: string) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 Chrome/124.0',
    },
  });
  console.log(`  GET ${url} → ${res.status}`);
  if (!res.ok) return null;
  return res.json();
}

async function getHtml(url: string) {
  // Force gzip only — Node's undici fetch auto-decodes when we don't set Accept-Encoding,
  // but we want the raw bytes. Easiest: let fetch decode by omitting the header.
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'Mozilla/5.0 Chrome/124.0',
    },
  });
  const text = await res.text();
  console.log(`  GET ${url} → ${res.status} (${text.length}B)`);
  return { status: res.status, body: text };
}

async function main() {
  // 1) WP taxonomy — categories (works)
  console.log('Step 1: WP taxonomy vendedores_category');
  const cats: any[] = (await getJson(`${ROOT}vendedores_category?per_page=100`)) ?? [];
  console.log(`  categories: ${cats.length}`);
  for (const c of cats) console.log(`    ${c.name.padEnd(25)} count=${c.count}`);

  // 2) WP CPT mp_vendedores — 404 (REST-gated)
  console.log('\nStep 2: Probe mp_vendedores CPT');
  const cpt = await getJson(`${ROOT}mp_vendedores?per_page=5`);
  console.log(`  mp_vendedores accessible via REST: ${cpt ? 'yes' : 'no (gated)'}`);

  // 3) Homepage HTML (decompressed) — actually contains promo cards
  console.log('\nStep 3: Scrape homepage HTML (the only usable path)');
  const home = await getHtml(HOME);
  // Pull plain text
  const text = home.body
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  console.log(`  text length: ${text.length}`);
  console.log(`  first 1200 chars:\n    ${text.slice(0, 1200)}`);

  // 4) Rough seller extraction from HTML
  const sellerLinks = [...new Set((home.body.match(/\/seller\/[a-z0-9-]+\//g) ?? []).filter((s) => !/^\/seller\/\d+\/$/.test(s)))];
  console.log(`\n  seller slugs on homepage: ${sellerLinks.length}`);
  sellerLinks.forEach((s) => console.log(`    ${s}`));

  await writeFile(
    new URL('./samples/mp.json', import.meta.url),
    JSON.stringify(
      {
        wp_root: ROOT,
        categories: cats.map((c) => ({ name: c.name, slug: c.slug, count: c.count })),
        mp_vendedores_cpt_rest_accessible: !!cpt,
        homepage_seller_slugs: sellerLinks,
        representative_visible_text: text.slice(0, 3000),
        notes: [
          'Seller detail pages at /seller/<slug>/ 301-redirect to the merchant site — not usable.',
          'Homepage HTML (decompressed from gzip) contains ~12 seller cards with pct/duration text.',
          'MP Promociones is cuotas-focused, not cashback-tope. tope/tope_period are absent.',
          'Real extraction path: scrape /, then each /seller/<slug>/ is a dead end — use the home cards only.',
        ],
      },
      null,
      2,
    ),
  );
  console.log('  sample saved → scripts/samples/mp.json');

  const report: CoverageReport = {
    merchant: { coverage: 'direct', note: 'Seller name appears as uppercase heading in each card (e.g., "DASH", "SAMSONITE").' },
    category: { coverage: 'derivable', note: "WP taxonomy `vendedores_category` maps categories (Electro, Moda, Hogar, Salud y Belleza, Turismo) but mostly e-commerce — map to 'otro' since no supermercado/farmacia." },
    wallet: { coverage: 'derivable', note: "Fixed 'mercadopago' for this source." },
    pct: { coverage: 'derivable', note: 'Most cards carry "Hasta X% OFF" in card text; regex or LLM extracts.' },
    tope: { coverage: 'absent', note: 'MP promos are cuotas-sin-interés + %-off at checkout, no ARS cashback cap.' },
    tope_period: { coverage: 'absent', note: 'Not applicable to this source.' },
    valid_days: { coverage: 'absent', note: 'Cards show a date range, not weekdays.' },
    valid_regions: { coverage: 'absent', note: 'E-commerce, national by default.' },
    valid_from: { coverage: 'derivable', note: '"Válido del 3 al 9 de noviembre" — regex or LLM parses to ISO date.' },
    valid_to: { coverage: 'derivable', note: 'Same string as valid_from.' },
    requires_min_spend: { coverage: 'absent', note: 'Not stated in card text.' },
  };
  printCoverage('mercadopago (WP + HTML)', report);
  console.log(
    '\nVerdict: Usable but LOW-VALUE for our wedge. MP Promos = e-commerce cuotas/%-off catalog, ' +
      'not cashback-with-tope. Our core sort-by-tope feature does not apply. Include these promos ' +
      "in the DB for completeness but they will never rank in the 'biggest tope' view.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
