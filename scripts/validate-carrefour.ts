// Validate: Carrefour (VTEX catalog_system API)
// Same shape as Día. We want to confirm cross-store consistency.
import { writeFile } from 'node:fs/promises';
import { printCoverage, type CoverageReport } from './promo-schema.js';

const ENDPOINT = 'https://www.carrefour.com.ar/api/catalog_system/pub/products/search?_from=0&_to=9';

async function main() {
  console.log(`GET ${ENDPOINT}`);
  const res = await fetch(ENDPOINT, {
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  });
  console.log(`  status=${res.status}`);
  if (!res.ok) {
    const body = await res.text();
    console.error(body.slice(0, 500));
    process.exit(1);
  }
  const json: any = await res.json();
  console.log(`  products=${Array.isArray(json) ? json.length : 'not-array'}`);
  if (!Array.isArray(json) || json.length === 0) process.exit(1);

  const p = json[0];
  const item = p.items?.[0];
  const seller = item?.sellers?.[0];
  // NOTE: VTEX uses the legacy misspelling 'commertialOffer'.
  const offer = seller?.commertialOffer;

  // Scan all products to find any teaser (not every SKU has one).
  let anyTeaser: any = null;
  let teaserProductName: string | null = null;
  for (const prod of json) {
    for (const i of prod.items ?? []) {
      for (const s of i.sellers ?? []) {
        const o = s.commertialOffer;
        if ((o?.Teasers?.length || o?.PromotionTeasers?.length) && !anyTeaser) {
          anyTeaser = o.PromotionTeasers?.[0] ?? o.Teasers?.[0];
          teaserProductName = prod.productName;
        }
      }
    }
  }
  if (anyTeaser) {
    console.log(`\nFound teaser on "${teaserProductName}":`, JSON.stringify(anyTeaser, null, 2));
  }

  await writeFile(
    new URL('./samples/carrefour.json', import.meta.url),
    JSON.stringify(p, null, 2),
  );
  console.log('  sample saved → scripts/samples/carrefour.json');

  if (offer) {
    console.log('\ncommertialOffer keys:', Object.keys(offer).sort().join(', '));
    console.log('  Installments count:', offer.Installments?.length ?? 0);
    const psNames = [...new Set((offer.Installments ?? []).map((i: any) => i.PaymentSystemName))];
    console.log('  unique PaymentSystemNames:', psNames.join(' | '));
    console.log('  Teasers count:', offer.Teasers?.length ?? 0);
    console.log('  PromotionTeasers count:', offer.PromotionTeasers?.length ?? 0);
  }

  const hasWalletPS = (offer?.Installments ?? []).some((i: any) =>
    /modo|mercado|cuenta\s*dni|uala|naranja/i.test(i.PaymentSystemName ?? ''),
  );
  const report: CoverageReport = {
    merchant: { coverage: 'direct', note: "Fixed ('Carrefour')." },
    category: { coverage: 'derivable', note: "Fixed ('supermercado')." },
    wallet: {
      coverage: hasWalletPS ? 'derivable' : 'llm',
      note: 'Installments[].PaymentSystemName lists card brands + a few wallets. Teaser Name + BIN restrictions identify issuer bank.',
    },
    pct: {
      coverage: anyTeaser ? 'derivable' : 'absent',
      note: 'PromotionTeasers[].Effects.Parameters.PercentualDiscount gives per-SKU %, not cashback-cap promo.',
    },
    tope: {
      coverage: 'absent',
      note: 'No ARS cap anywhere. Teasers express %-off at checkout, not cashback with a monthly tope.',
    },
    tope_period: { coverage: 'absent', note: 'Not present.' },
    valid_days: { coverage: 'llm', note: 'Teaser Name may mention day; unstructured.' },
    valid_regions: { coverage: 'absent', note: 'No region field; implicit store coverage.' },
    valid_from: { coverage: 'absent', note: 'GeneralValues is {} in sampled teaser.' },
    valid_to: { coverage: 'absent', note: 'Same as valid_from.' },
    requires_min_spend: { coverage: 'absent', note: 'Not in product-level payload.' },
  };
  printCoverage('carrefour (VTEX)', report);
  console.log(
    '\nVerdict: same as Día. VTEX is for product pricing + BIN-restricted card discounts, NOT for bank/wallet cashback with tope. Do not rely on it for the primary promo feed.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
