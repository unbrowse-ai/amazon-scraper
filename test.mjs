import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { classifyUrl, currencyOf, isBlocked, parsePrice, parseProduct, parseRanks, parseSearch } from "./parse.mjs";

const fx = (n) => fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

test("amazon product page: core fields", () => {
  const p = parseProduct(fx("amazon-product.html"));
  assert.equal(p.asin, "B0D4Z9RPT8");
  assert.equal(p.brand, "Anker");
  assert.equal(p.price, 34.99);
  assert.equal(p.currency, "USD");
  assert.equal(p.rating, 4.8);
  assert.equal(p.reviewsCount, 3441);
  assert.equal(p.seller, "AnkerDirect");
  assert.deepEqual(p.bestSellersRank, [{ rank: 54, category: "USB Cables" }]);
  assert.ok(p.features.length >= 5 && p.images.length >= 5 && p.breadcrumbs.at(-1) === "USB Cables");
  assert.equal(p.details["Model"], "A88E2");
});

test("amazon search page: cards and next page", () => {
  const s = parseSearch(fx("amazon-search.html"));
  assert.equal(s.items.length, 22);
  for (const i of s.items) assert.ok(i.asin && i.title && i.price > 0 && i.url.endsWith(i.asin));
  assert.ok(s.items.some((i) => i.isSponsored) && s.items.some((i) => !i.isSponsored));
  assert.match(s.nextUrl, /page=2/);
  assert.ok(!s.items.some((i) => i.title.startsWith("Sponsored")));
});

test("amazon: bot check is recognised", () => {
  assert.ok(isBlocked('<form action="/errors/validateCaptcha">Type the characters you see in this image</form>'));
  assert.equal(parseSearch("<p>Type the characters you see in this image</p>"), null);
});

test("amazon helpers", () => {
  assert.equal(parsePrice("1.234,56 €"), 1234.56);
  assert.equal(parsePrice("$1,234.56"), 1234.56);
  assert.equal(parsePrice("12,99 €"), 12.99);
  assert.deepEqual(classifyUrl("https://www.amazon.com/dp/B0D4Z9RPT8?th=1"), { type: "product", asin: "B0D4Z9RPT8", domain: "amazon.com" });
  assert.equal(classifyUrl("https://www.amazon.com/s?k=tv").type, "listing");
  assert.throws(() => classifyUrl("https://www.amazon.fr/dp/B0D4Z9RPT8"));
  assert.deepEqual(parseRanks("#12 in Kitchen & Dining (See Top 100) #3 in Espresso Machines"), [{ rank: 12, category: "Kitchen & Dining" }, { rank: 3, category: "Espresso Machines" }]);
  assert.equal(currencyOf("$34.99", "amazon.com"), "USD");
  assert.equal(currencyOf("S$44.70", "amazon.com"), "SGD");
});
