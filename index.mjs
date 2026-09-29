#!/usr/bin/env node
// Amazon Scraper: search results and product pages from amazon.com as structured JSON.
// Pages are read through the public Unbrowse tool public.amazon_com.read_page, sent from this machine;
// without a key, or when the tool is unavailable, the same page is requested directly.
import { fileURLToPath } from "node:url";
import { cli, mapLimit, readPage } from "./lib/read-page.mjs";
import { classifyUrl, isBlocked, parseProduct, parseSearch } from "./parse.mjs";

const CAPABILITY = "public.amazon_com.read_page";
const HOSTS = ["amazon.com"];
const refused = (page) => (page.status === 200 && isBlocked(page.body) ? "Amazon bot check" : false);
// Amazon prices in the currency it guesses from your IP (SGD from Singapore, EUR from Germany...).
// Its own currency preference cookie pins it; we add it to the request this machine sends.
let currency = "USD";
const withCurrency = (url, init) => {
  const headers = { ...init.headers };
  if (currency) headers.cookie = [headers.cookie, `i18n-prefs=${currency}`].filter(Boolean).join("; ");
  return fetch(url, { ...init, headers });
};
// direct: the same page, requested straight from this machine when the Unbrowse tool cannot run. Amazon answers a
// desktop Chrome user agent from a non-browser client with a 503 "Sorry! Something went wrong!" page, and a plain,
// honest one with the normal page, so the direct request names itself.
const DIRECT_UA = "Mozilla/5.0 (compatible; open-scrapers/0.1; +https://github.com/unbrowse-ai/open-scrapers)";
const get = (path) => readPage(CAPABILITY, { path }, { hosts: HOSTS, refused, fetch: withCurrency, direct: { url: `https://www.amazon.com${path}`, headers: { "user-agent": DIRECT_UA } } });
const pathOf = (url) => {
  const u = new URL(url);
  return u.pathname + u.search;
};
// ASINs: B0 + 8 characters, or a 10-digit ISBN for books. Anything else is a search.
const ASIN = /^(B0[A-Z0-9]{8}|\d{9}[\dX])$/;
const classify = (url) => {
  const c = classifyUrl(url);
  if (c.domain !== "amazon.com") throw new Error(`Only amazon.com is covered by the public tool (got ${c.domain})`);
  return c;
};

/** Currency Amazon should price in (USD, EUR, GBP, ...); null lets Amazon pick from your IP. */
export function setCurrency(code) {
  currency = code ? String(code).toUpperCase() : null;
}

/** One product by ASIN or URL. */
export async function scrapeProduct(asinOrUrl) {
  const asin = ASIN.test(asinOrUrl) ? asinOrUrl : classify(asinOrUrl).asin;
  if (!asin) throw new Error(`Not an Amazon product: ${asinOrUrl}`);
  const page = await get(`/dp/${asin}`);
  const p = parseProduct(page.body);
  if (!p) throw new Error(`${asin}: the page is not a product page`);
  return { ...p, scrapedAt: new Date().toISOString() };
}

/**
 * Search amazon.com (or read a search/category URL) and return up to `max` result cards,
 * following "Next" pages. `details: true` also reads each product page (one extra call per item).
 */
export async function scrapeSearch(queryOrUrl, { max = 48, details = false, concurrency = 3, log = () => {} } = {}) {
  let path = /^https?:\/\//.test(queryOrUrl) ? pathOf(classify(queryOrUrl).url) : `/s?k=${encodeURIComponent(queryOrUrl)}`;
  const items = [];
  const seen = new Set();
  for (let pageNo = 1; path && items.length < max && pageNo <= 20; pageNo++) {
    let page = await get(path);
    let res = parseSearch(page.body);
    // Now and then Amazon serves a full-size results page with no result cards; one more try usually has them.
    if (res && !res.items.length && pageNo === 1) {
      await new Promise((r) => setTimeout(r, 2000));
      page = await get(path);
      res = parseSearch(page.body);
    }
    if (!res) throw new Error("Amazon did not return a search page");
    log(`page ${pageNo}: ${res.items.length} results`);
    if (!res.items.length) break;
    for (const it of res.items) {
      if (items.length >= max || seen.has(it.asin)) continue;
      seen.add(it.asin);
      items.push({ ...it, position: items.length + 1, searchQuery: queryOrUrl });
    }
    path = res.nextUrl ? pathOf(res.nextUrl) : null;
  }
  if (details) {
    const full = await mapLimit(items, concurrency, (it) => scrapeProduct(it.asin));
    full.forEach((p, i) => {
      if (p?.error) items[i].detailsError = p.error.message;
      else Object.assign(items[i], p, { position: items[i].position, isSponsored: items[i].isSponsored, boughtLastMonth: items[i].boughtLastMonth });
    });
  }
  const now = new Date().toISOString();
  return items.map((it) => ({ ...it, scrapedAt: it.scrapedAt ?? now }));
}

/** Everything the CLI does: product URLs/ASINs become products, anything else is a search. */
export async function scrape(inputs, opts = {}) {
  if (opts.currency !== undefined) setCurrency(opts.currency);
  const out = [];
  for (const input of inputs) {
    const isProduct = ASIN.test(input) || (/^https?:\/\//.test(input) && classify(input).type === "product");
    if (isProduct) out.push(await scrapeProduct(input));
    else out.push(...(await scrapeSearch(input, opts)));
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli(
    (pos, f) => scrape(pos, { max: Number(f.max ?? 48), details: !!f.details, currency: f.currency === "auto" ? null : (f.currency ?? "USD"), log: (m) => process.stderr.write(m + "\n") }),
    `
Usage: node index.mjs <search terms | amazon.com URL | ASIN>... [--max 48] [--details]

  "wireless earbuds"                      search results (title, price, rating, reviews, sponsored flag)
  https://www.amazon.com/dp/B0D4Z9RPT8    one product (price, seller, features, images, ranks, details)
  --max N      result cards per search (default 48, about 16-22 per page)
  --details    also read every product page (one extra call per item)
  --currency C price in this currency (default USD; "auto" = whatever Amazon picks for your IP)

Uses UNBROWSE_API_KEY when set (free at https://unbrowse.ai); without it, requests go straight to the site.`,
  );
}
