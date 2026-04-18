// Validate: Día (VTEX catalog_system API)
// Goal: inspect a sample product and see whether PaymentSystems / Installments / PromotionTeasers
// express bank/wallet-specific promos with tope in ARS.
import { writeFile } from 'node:fs/promises';
import { printCoverage, type CoverageReport } from './promo-schema.js';

const ENDPOINT = 'https://diaonline.supermercadosdia.com.ar/api/catalog_system/pub/products/search?_from=0&_to=49';

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
    console.error(`Request failed: ${res.status} ${res.statusText}`);
    const body = await res.text();
    console.error(body.slice(0, 500));
    process.exit(1);
  }
  const json: any = await res.json();
  console.log(`  products=${json.length}`);
  if (!Array.isArray(json) || json.length === 0) {
    console.error('No products returned');
    process.exit(1);
  }

  // Take first product, first item, first seller → that's where commertialOffer lives.
  // NOTE: VTEX misspells the key as "commertialOffer" (intentional legacy).
  const p = json[0];
  const item = p.items?.[0];
  const seller = item?.sellers?.[0];
  const offer = seller?.commertialOffer;

  // Scan across all returned products to find one with non-empty Teasers/PromotionTeasers.
  let anyTeaser: any = null;
  let anyTeaserProduct: any = null;
  for (const prod of json) {
    for (const i of prod.items ?? []) {
      for (const s of i.sellers ?? []) {
        const o = s.commertialOffer;
        if ((o?.Teasers?.length || o?.PromotionTeasers?.length) && !anyTeaser) {
          anyTeaser = o.PromotionTeasers?.[0] ?? o.Teasers?.[0];
          anyTeaserProduct = prod.productName;
        }
      }
    }
  }
  if (anyTeaser) {
    console.log(`\nFound teaser on "${anyTeaserProduct}":`, JSON.stringify(anyTeaser, null, 2));
  } else {
    console.log('\nNo teasers found in first 10 products — try a category filter or bigger page.');
  }

  await writeFile(
    new URL('./samples/dia.json', import.meta.url),
    JSON.stringify(p, null, 2),
  );
  console.log(`  sample saved → scripts/samples/dia.json`);

  // Inspect keys of interest
  console.log('\nTop-level product keys:', Object.keys(p).sort().join(', '));
  if (offer) {
    console.log('commertialOffer keys:', Object.keys(offer).sort().join(', '));
    console.log('  Installments count:', offer.Installments?.length ?? 0);
    const psNames = [...new Set((offer.Installments ?? []).map((i: any) => i.PaymentSystemName))];
    console.log('  unique PaymentSystemNames:', psNames.join(' | '));
    console.log('  Teasers count:', offer.Teasers?.length ?? 0);
    console.log('  PromotionTeasers count:', offer.PromotionTeasers?.length ?? 0);
    console.log('  DiscountHighLight:', JSON.stringify(offer.DiscountHighLight)?.slice(0, 200));
  }

  // Coverage mapping — what we can pull for a Promo row
  const hasWalletPS = (offer?.Installments ?? []).some((i: any) =>
    /modo|mercado|cuenta\s*dni|uala|naranja/i.test(i.PaymentSystemName ?? ''),
  );
  const report: CoverageReport = {
    merchant: { coverage: 'direct', note: "Fixed ('Día') — comes from the source config, not the payload." },
    category: { coverage: 'derivable', note: "Fixed ('supermercado') for the whole source." },
    wallet: {
      coverage: hasWalletPS ? 'derivable' : 'llm',
      note: hasWalletPS
        ? "Installments[].PaymentSystemName includes wallet tokens like 'Modo Payment', 'MercadoPagoPro'. Map name→wallet enum."
        : 'PaymentSystemName in Installments mostly lists card brands; wallet inference needs LLM over teaser text.',
    },
    pct: {
      coverage: anyTeaser ? 'derivable' : 'absent',
      note: 'PromotionTeasers[].Effects.Parameters has PercentualDiscount. Per-SKU effect, not a cashback %.',
    },
    tope: {
      coverage: 'absent',
      note: 'No ARS cashback cap field anywhere. VTEX teasers express %-off-item; banks express tope elsewhere.',
    },
    tope_period: { coverage: 'absent', note: 'Not present.' },
    valid_days: {
      coverage: 'llm',
      note: 'Teaser Name occasionally contains day-of-week words; not structured.',
    },
    valid_regions: {
      coverage: 'absent',
      note: 'No region on the product. Implicitly tied to the store (Día covers AR nationwide).',
    },
    valid_from: { coverage: 'absent', note: 'Teaser GeneralValues is {} in sampled products.' },
    valid_to: { coverage: 'absent', note: 'Same as valid_from.' },
    requires_min_spend: { coverage: 'absent', note: 'Not in product-level payload.' },
  };
  printCoverage('dia (VTEX)', report);
  console.log(
    '\nVerdict: VTEX is a PRICE + BIN-restricted card-promo API, not a bank/wallet cashback API. Use for reference prices and card-specific discounts only. Tope must come from elsewhere.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
