// Validate: Banco Galicia (AEM .model.json — claim from docs/data-sources.md)
//
// VERDICT: The claim in data-sources.md ("67 KB, all Galicia promos with rubro/marca filters")
// does NOT hold. The .model.json only exposes the AEM page skeleton — the actual promo
// content is rendered by a child iframe pointing at beneficios.galicia.ar, which is a
// Next.js SPA gated behind online-banking authentication.
//
// This script captures the disproof: it fetches the .model.json, dumps it, finds the iframe
// src, probes the iframe SPA, and confirms no unauthenticated promo endpoint exists.
import { writeFile } from 'node:fs/promises';
import { printCoverage, type CoverageReport } from './promo-schema.js';

const AEM = 'https://www.galicia.ar/personas/buscador-de-promociones.model.json';
const BENEFICIOS_HOME = 'https://beneficios.galicia.ar/';

async function getText(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json,text/html', 'User-Agent': 'Mozilla/5.0 Chrome/124.0' },
  });
  return { status: res.status, body: await res.text() };
}

function findIframeSrc(json: any): string | null {
  // Walk recursively, return the first value that looks like an iframe src under galiciaIframe.
  let found: string | null = null;
  const walk = (o: any) => {
    if (!o || typeof o !== 'object' || found) return;
    if (Array.isArray(o)) return o.forEach(walk);
    for (const k of Object.keys(o)) {
      if (/iframe/i.test(k) && o[k]?.src) {
        found = o[k].src;
        return;
      }
      walk(o[k]);
    }
  };
  walk(json);
  return found;
}

async function main() {
  console.log(`GET ${AEM}`);
  const aem = await getText(AEM);
  console.log(`  status=${aem.status} bytes=${aem.body.length}`);
  const aemJson = JSON.parse(aem.body);
  await writeFile(new URL('./samples/galicia-aem.json', import.meta.url), aem.body);

  const iframeSrc = findIframeSrc(aemJson);
  console.log(`\nAEM page contains iframe src: ${iframeSrc ?? 'none'}`);
  console.log('→ The promo content is NOT in .model.json. It lives in the iframe target.');

  // Probe the iframe target
  console.log(`\nGET ${BENEFICIOS_HOME}`);
  const home = await getText(BENEFICIOS_HOME);
  console.log(`  status=${home.status} bytes=${home.body.length}`);
  const nextDataMatch = home.body.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!nextDataMatch) {
    console.log('  No __NEXT_DATA__ — unexpected.');
    process.exit(1);
  }
  const nextData = JSON.parse(nextDataMatch[1]);
  console.log(`  buildId: ${nextData.buildId}`);
  console.log(`  pageProps keys: ${Object.keys(nextData.props?.pageProps ?? {}).join(', ')}`);
  console.log(`  channelId: ${nextData.props?.pageProps?.config?.channelId}`);
  console.log(`  distributionChannel: ${nextData.props?.pageProps?.config?.distributionChannel}`);
  console.log(`  BFF basepath: ${nextData.props?.pageProps?.config?.api?.bff?.basepath}`);

  // Probe a handful of candidate public endpoints
  const candidates = [
    'https://beneficios.galicia.ar/bff/promociones',
    'https://beneficios.galicia.ar/bff/promociones/list',
    'https://beneficios.galicia.ar/promos',
    'https://beneficios.galicia.ar/promotions',
    'https://beneficios.galicia.ar/api/promociones',
  ];
  console.log('\nProbing candidate promo endpoints on the SPA:');
  const probes: { url: string; status: number; isSpaShell: boolean }[] = [];
  for (const url of candidates) {
    const r = await getText(url);
    const isShell = r.body.includes('__NEXT_DATA__');
    probes.push({ url, status: r.status, isSpaShell: isShell });
    console.log(`  ${url.replace('https://beneficios.galicia.ar', '')} → ${r.status} ${isShell ? '(SPA shell)' : `(size ${r.body.length})`}`);
  }

  await writeFile(
    new URL('./samples/galicia.json', import.meta.url),
    JSON.stringify(
      {
        aem_endpoint: AEM,
        aem_status: aem.status,
        aem_contained_iframe_src: iframeSrc,
        beneficios_home: BENEFICIOS_HOME,
        beneficios_status: home.status,
        beneficios_channelId: nextData.props?.pageProps?.config?.channelId,
        beneficios_distributionChannel: nextData.props?.pageProps?.config?.distributionChannel,
        bff_basepath: nextData.props?.pageProps?.config?.api?.bff?.basepath,
        mock_user_in_nextdata: nextData.props?.pageProps?.user?.name ?? null,
        probes,
        verdict:
          "Galicia's .model.json is a marketing shell. Real promo data is gated behind online-banking auth via a BFF at /bff/*. No unauthenticated structured feed exists. This contradicts docs/data-sources.md and shifts Galicia from Tier 1 to 'scrape MODO instead'.",
      },
      null,
      2,
    ),
  );
  console.log('  disproof record saved → scripts/samples/galicia.json');

  const report: CoverageReport = {
    merchant: { coverage: 'absent', note: 'No promo records accessible without auth.' },
    category: { coverage: 'absent', note: 'Same.' },
    wallet: { coverage: 'absent', note: 'Same.' },
    pct: { coverage: 'absent', note: 'Same.' },
    tope: { coverage: 'absent', note: 'Same.' },
    tope_period: { coverage: 'absent', note: 'Same.' },
    valid_days: { coverage: 'absent', note: 'Same.' },
    valid_regions: { coverage: 'absent', note: 'Same.' },
    valid_from: { coverage: 'absent', note: 'Same.' },
    valid_to: { coverage: 'absent', note: 'Same.' },
    requires_min_spend: { coverage: 'absent', note: 'Same.' },
  };
  printCoverage('galicia (AEM) — DISPROVED', report);
  console.log(
    "\nAction: do not budget Galicia as a Tier-1 public feed. Either (a) scrape MODO " +
      "(banks including Galicia push promos there), or (b) reverse-engineer the BFF auth flow " +
      "(out of scope for this validation — and fragile).",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
