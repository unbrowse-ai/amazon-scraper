// Amazon product and search-result parsers. Pure: HTML in, plain objects out.
import * as cheerio from "cheerio";

/** Store domains we accept, with the exit country that shows local prices and stock. */
export const DOMAINS = {
  "amazon.com": { country: "US", currency: "USD" },
  "amazon.de": { country: "DE", currency: "EUR" },
  "amazon.ca": { country: "CA", currency: "CAD" },
};

/** Currency from the price as displayed ("S$44.70" is Singapore dollars even on amazon.com). */
export function currencyOf(priceText, domain) {
  const t = (priceText ?? "").trim();
  const table = [[/^S\$|SGD/, "SGD"], [/^CA?\$|CAD|C\$/, "CAD"], [/^A\$|AUD/, "AUD"], [/^HK\$|HKD/, "HKD"], [/^NZ\$/, "NZD"], [/^MX\$/, "MXN"], [/^R\$/, "BRL"], [/€|EUR/, "EUR"], [/£|GBP/, "GBP"], [/¥|JPY|￥/, "JPY"], [/₹|INR/, "INR"], [/^\$|USD|US\$/, "USD"]];
  for (const [re, c] of table) if (re.test(t)) return c;
  return t ? DOMAINS[domain]?.currency ?? null : null;
}

const clean = (s) => (s ?? "").replace(/[‎‏]/g, "").replace(/\s+/g, " ").trim();

/** "$1,234.56" / "1.234,56 €" / "£8.99" → 1234.56 */
export function parsePrice(s) {
  const t = clean(s);
  const m = t.match(/\d[\d.,\s]*/);
  if (!m) return null;
  let n = m[0].replace(/\s/g, "");
  // Decimal separator is whichever of , or . comes last with 1–2 digits after it.
  const dec = n.match(/[.,](\d{1,2})$/);
  n = dec ? n.slice(0, -dec[0].length).replace(/[.,]/g, "") + "." + dec[1] : n.replace(/[.,]/g, "");
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

const toInt = (s) => {
  const m = clean(s).replace(/[.,\s](?=\d{3}\b)/g, "").match(/\d+/);
  return m ? Number(m[0]) : null;
};
const toRating = (s) => {
  const m = clean(s).match(/(\d+(?:[.,]\d)?)/);
  return m ? Number(m[1].replace(",", ".")) : null;
};

/** Classify a user URL: product (with ASIN) or listing (search, category, bestseller page). */
export function classifyUrl(raw) {
  const u = new URL(raw.trim());
  const host = u.hostname.replace(/^(www|smile)\./, "");
  if (!DOMAINS[host]) throw new Error(`Unsupported Amazon domain: ${u.hostname} (supported: ${Object.keys(DOMAINS).join(", ")})`);
  const asin = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|product-reviews)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1];
  if (asin) return { type: "product", asin: asin.toUpperCase(), domain: host };
  return { type: "listing", url: u.toString(), domain: host };
}

export const productUrl = (asin, domain = "amazon.com") => `https://www.${domain}/dp/${asin}`;
export const searchUrl = (query, domain = "amazon.com") => `https://www.${domain}/s?k=${encodeURIComponent(query)}`;

/** The page without scripts, styles and inline SVG: most of an Amazon page's bytes, none of the fields we read. */
export const lean = (html) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "").replace(/<svg\b[\s\S]*?<\/svg>/gi, "");

/** Is this a bot check / sign-in wall rather than a real page? */
export function isBlocked(html) {
  return !html || /api-services-support@amazon\.com|\/errors\/validateCaptcha|Type the characters you see in this image/i.test(html.slice(0, 20000));
}

function bylineBrand(s) {
  const t = clean(s);
  return (
    t.match(/^Visit the (.+?) Store$/)?.[1] ??
    t.match(/^Brand: (.+)$/)?.[1] ??
    t.match(/^Besuchen Sie den (.+?)-Store$/)?.[1] ??
    t.match(/^Marke: (.+)$/)?.[1] ??
    null
  );
}

function detailPairs($) {
  const out = {};
  $("table[id^=productDetails] tr, table.prodDetTable tr, table.a-keyvalue tr").each((_, tr) => {
    const k = clean($(tr).find("th").first().text());
    const v = clean($(tr).find("td").first().clone().find("script, style").remove().end().text());
    if (k && v && !(k in out)) out[k] = v;
  });
  $("#detailBullets_feature_div li, #detailBulletsWrapper_feature_div li, #rich_product_information li").each((_, li) => {
    const bold = $(li).find("span.a-text-bold").first();
    const t = clean(bold.text()).replace(/\s*:\s*$/, "");
    const v = clean($(li).children(".a-list-item").first().clone().find("span.a-text-bold, script, style").remove().end().text() || bold.nextAll("span").first().text());
    if (t && v && !(t in out)) out[t] = v;
  });
  delete out["Customer Reviews"];
  delete out["Kundenrezensionen"];
  return out;
}

/** "#54 in USB Cables #1,273 in Books (See Top 100 in Books) #1 in Hard Science Fiction" → [{ rank, category }] */
export function parseRanks(text) {
  const out = [];
  for (const m of clean(text).matchAll(/(?:#|Nr\.\s*)([\d.,]+)\s+(?:in|en)\s+(.+?)(?=\s*\(|\s+(?:#|Nr\.)\d|$)/g)) {
    out.push({ rank: toInt(m[1]), category: m[2].trim() });
  }
  return out;
}

/** Product detail page → structured product. Returns null when the page is not a product. */
export function parseProduct(html, { domain = "amazon.com" } = {}) {
  if (isBlocked(html)) return null;
  const $ = cheerio.load(lean(html));
  const title = clean($("#productTitle").text());
  if (!title) return null;
  const asin =
    $("input#ASIN").attr("value") ??
    $("[data-asin]").filter((_, e) => /^[A-Z0-9]{10}$/.test($(e).attr("data-asin"))).first().attr("data-asin") ??
    html.match(/"parentAsin"\s*:\s*"([A-Z0-9]{10})"/)?.[1] ??
    null;

  const priceText =
    [
      "#corePrice_feature_div .a-price .a-offscreen",
      "#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen",
      "#tp_price_block_total_price_ww .a-offscreen",
      "#apex_desktop .a-price .a-offscreen",
      "#price",
      "#kindle-price",
    ]
      .map((s) => clean($(s).first().text()))
      .find(Boolean) ?? null;
  const listText = clean($("#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen, #corePrice_desktop .a-text-price .a-offscreen").first().text()) || null;
  const price = parsePrice(priceText);
  const listPrice = parsePrice(listText);

  const details = detailPairs($);
  const rankText = details["Best Sellers Rank"] ?? details["Amazon Bestseller-Rang"] ?? details["Best-sellers rank"] ?? "";
  delete details["Best Sellers Rank"];
  delete details["Amazon Bestseller-Rang"];

  const byline = clean($("#bylineInfo").text());
  const authors = $("#bylineInfo .author a").map((_, a) => clean($(a).text())).get().filter((a) => a && !/^\(/.test(a));
  const images = [...new Set([...html.matchAll(/"hiRes":"(https:[^"]+)"/g)].map((m) => m[1]))];
  const mainImage = $("#landingImage").attr("data-old-hires") || $("#landingImage").attr("src") || $("#imgBlkFront").attr("src") || images[0] || null;
  const availability = clean($("#availability span").first().text()) || clean($("#availability").clone().find("script, style").remove().end().text()) || null;
  const seller = clean($("#sellerProfileTriggerId").first().text()) || clean($("#merchantInfoFeature_feature_div .offer-display-feature-text-message").first().text()) || null;
  const shipsFrom = clean($("#fulfillerInfoFeature_feature_div .offer-display-feature-text-message").first().text()) || null;
  const description =
    clean($("#productDescription").clone().find("script, style").remove().end().text()) ||
    clean($("#bookDescription_feature_div").clone().find("script, style").remove().end().text()).replace(/\s*Read more\s*$/, "") ||
    null;

  return {
    asin,
    url: productUrl(asin, domain),
    title,
    brand: bylineBrand(byline) ?? details["Brand"] ?? details["Brand Name"] ?? details["Manufacturer"] ?? null,
    authors: authors.length ? authors : undefined,
    price,
    currency: price == null ? null : currencyOf(priceText, domain),
    listPrice: listPrice && price && listPrice > price ? listPrice : null,
    priceText,
    rating: toRating($("#acrPopover").attr("title") || $("#acrPopover").text()),
    reviewsCount: toInt($("#acrCustomerReviewText").first().text()),
    availability,
    inStock: availability ? !/unavailable|out of stock|nicht verfügbar|derzeit nicht/i.test(availability) : price != null,
    seller,
    shipsFrom,
    isAmazonSeller: seller ? /^amazon(\.\w+)*$/i.test(seller) : null,
    features: $("#feature-bullets li, #feature-bullets-btf li").map((_, li) => clean($(li).text())).get().filter(Boolean),
    description,
    breadcrumbs: $("#wayfinding-breadcrumbs_feature_div li a").map((_, a) => clean($(a).text())).get().filter(Boolean),
    bestSellersRank: parseRanks(rankText),
    mainImage,
    images: images.length ? images : mainImage ? [mainImage] : [],
    details,
  };
}

/** Search / category page → { items: [...cards], nextUrl }. */
export function parseSearch(html, { domain = "amazon.com" } = {}) {
  if (isBlocked(html)) return null;
  const $ = cheerio.load(lean(html));
  const items = [];
  $("div[data-component-type=s-search-result][data-asin]").each((_, el) => {
    const x = $(el);
    const asin = x.attr("data-asin");
    if (!/^[A-Z0-9]{10}$/.test(asin ?? "")) return;
    const aria = x.find("h2").attr("aria-label") ?? "";
    const priceText = clean(x.find(".a-price:not(.a-text-price) .a-offscreen").first().text()) || null;
    const price = parsePrice(priceText);
    const listText = clean(x.find(".a-price.a-text-price[data-a-strike=true] .a-offscreen").first().text()) || null;
    const listPrice = parsePrice(listText);
    items.push({
      asin,
      url: productUrl(asin, domain),
      title: aria.replace(/^Sponsored Ad - /, "").trim() || clean(x.find("h2").text()) || null,
      price,
      currency: price == null ? null : currencyOf(priceText, domain),
      listPrice: listPrice && price && listPrice > price ? listPrice : null,
      rating: toRating(x.find(".a-icon-alt").first().text()),
      reviewsCount: toInt(x.find("[aria-label$=ratings]").first().attr("aria-label") ?? x.find("a[href*=customerReviews] span").first().text()),
      boughtLastMonth: clean(x.text()).match(/([\d.,]+K?\+?) bought in past month/)?.[1] ?? null,
      isSponsored: /^Sponsored/.test(aria) || x.find(".puis-sponsored-label-text").length > 0,
      thumbnail: x.find("img.s-image").attr("src") ?? null,
    });
  });
  const next = $("a.s-pagination-next").attr("href");
  return { items, nextUrl: next ? new URL(next, `https://www.${domain}`).toString() : null };
}
