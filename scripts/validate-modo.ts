// Validate: MODO (https://www.modo.com.ar/promos)
//
// Strategy: try raw fetch first (anti-bot may block). If that fails, capture what we can
// and document the findings. For the LLM-extraction step we would use Firecrawl's
// firecrawl_extract tool — this script simulates the extraction shape with a local-
// parsing heuristic since the Firecrawl MCP call happens at the agent layer, not inside tsx.
import { writeFile } from 'node:fs/promises';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { printCoverage, type CoverageReport } from './promo-schema.js';

const LIST = 'https://www.modo.com.ar/promos';

async function getHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, br',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  const enc = res.headers.get('content-encoding');
  const buf = Buffer.from(await res.arrayBuffer());
  let out: Buffer = buf;
  try {
    if (enc === 'gzip') out = gunzipSync(buf);
    else if (enc === 'br') out = brotliDecompressSync(buf);
  } catch (e) {
    // leave raw
  }
  return { status: res.status, body: out.toString('utf8'), encoding: enc ?? 'none' };
}

async function main() {
  console.log(`GET ${LIST}`);
  const { status, body, encoding } = await getHtml(LIST);
  console.log(`  status=${status} encoding=${encoding} bytes=${body.length}`);

  await writeFile(new URL('./samples/modo-raw.html', import.meta.url), body);

  // Extract __NEXT_DATA__ if present
  const nextMatch = body.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextMatch) {
    const json = JSON.parse(nextMatch[1]);
    console.log('\n__NEXT_DATA__ found:');
    console.log('  buildId:', json.buildId);
    console.log('  page:', json.page);
    console.log('  pageProps keys:', Object.keys(json.props?.pageProps ?? {}));
    await writeFile(new URL('./samples/modo-nextdata.json', import.meta.url), JSON.stringify(json, null, 2));

    const pp = json.props?.pageProps;
    // Walk pageProps to find arrays that look promo-like
    const promoArrays: { path: string; length: number; sample: any }[] = [];
    const walk = (o: any, p: string, depth = 0) => {
      if (depth > 8 || o == null) return;
      if (Array.isArray(o) && o.length > 0 && typeof o[0] === 'object') {
        const keys = Object.keys(o[0]);
        const looksPromo = keys.some((k) =>
          /(descuento|promo|tope|reintegro|rubro|percent|pct|cashback|discount|comercio|merchant)/i.test(k),
        );
        if (looksPromo || keys.length > 5) {
          promoArrays.push({ path: p, length: o.length, sample: o[0] });
        }
      }
      if (typeof o === 'object' && !Array.isArray(o)) {
        for (const k of Object.keys(o)) walk(o[k], `${p}.${k}`, depth + 1);
      } else if (Array.isArray(o) && o.length) {
        walk(o[0], `${p}[0]`, depth + 1);
      }
    };
    walk(pp, 'pageProps');
    console.log(`\n  candidate arrays in pageProps: ${promoArrays.length}`);
    for (const a of promoArrays.slice(0, 10)) {
      console.log(`    ${a.path} — ${a.length} items — keys: ${Object.keys(a.sample).slice(0, 8).join(',')}`);
    }

    const best = promoArrays
      .filter((a) => a.length >= 3)
      .sort((a, b) => b.length - a.length)[0];
    if (best) {
      console.log(`\n  picking ${best.path} (${best.length} items) as representative:`);
      console.log(JSON.stringify(best.sample, null, 2).slice(0, 2000));
      await writeFile(
        new URL('./samples/modo.json', import.meta.url),
        JSON.stringify({ path: best.path, count: best.length, sample: best.sample }, null, 2),
      );
    }
  } else {
    console.log('\nNo __NEXT_DATA__ — content probably loaded entirely via client XHR.');
    // Look for bare JSON strings in inline scripts
    const scripts = body.match(/<script[^>]*>([\s\S]*?)<\/script>/g) ?? [];
    console.log(`  script tag count: ${scripts.length}`);
  }

  // Pull plain text — this is the representative content that a Firecrawl scrape
  // with onlyMainContent=true would produce (roughly).
  const text = body
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  console.log(`\nPlain text length: ${text.length}`);
  console.log(`  first 2000 chars:\n  ${text.slice(0, 2000)}`);

  const report: CoverageReport = {
    merchant: { coverage: 'llm', note: 'Promo cards mention merchant names as free text.' },
    category: { coverage: 'llm', note: 'MODO organizes by category but labels are free text (Supermercados, Farmacia, Gastronomía).' },
    wallet: { coverage: 'derivable', note: "Fixed 'modo' for this source; MODO acts as the wallet with bank card behind it." },
    pct: { coverage: 'llm', note: 'Card badges say "25%", "30%" — LLM extraction is trivial.' },
    tope: { coverage: 'llm', note: 'Typically in card text or /promos/<slug> detail page ("tope de reintegro $8.000").' },
    tope_period: { coverage: 'llm', note: 'Usually "semanal" / "mensual" in legal text.' },
    valid_days: { coverage: 'llm', note: 'Card or detail shows "Sábados", "Lunes a viernes".' },
    valid_regions: { coverage: 'llm', note: 'Some promos are province-scoped.' },
    valid_from: { coverage: 'llm', note: 'Detail page has vigencia dates.' },
    valid_to: { coverage: 'llm', note: 'Same.' },
    requires_min_spend: { coverage: 'llm', note: 'Rarely in legal text.' },
  };
  printCoverage('modo (HTML scrape)', report);
  console.log(
    '\nNext step (outside tsx): use mcp__firecrawl__firecrawl_scrape on /promos with onlyMainContent=true, ' +
      'then mcp__firecrawl__firecrawl_extract with the Promo JSON Schema. That call happens at the agent layer.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
