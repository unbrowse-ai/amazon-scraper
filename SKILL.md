---
name: amazon-scraper
description: Get Amazon.com search results or product details (price, rating, reviews, seller, Best Sellers Rank, specs) as JSON. Use when the user asks to look up, compare, monitor or collect Amazon products or prices.
---

# Amazon scraper

## When to use
- "Find the top-rated standing desks on Amazon under $300", "what does this ASIN cost", "collect 50 results for X with prices".
- Not for other retailers, and not for amazon.co.uk / .de / .jp (the public tool covers amazon.com).

## Run
Uses `UNBROWSE_API_KEY` when set (free at https://unbrowse.ai); without it, requests go straight to the site. From the repo root:

```bash
node index.mjs "<search terms>" --max 40 > out.json          # search cards
node index.mjs "<search terms>" --max 10 --details > out.json # + full product pages
node index.mjs B0D4Z9RPT8 > out.json                          # one product (ASIN or URL)
```

Progress goes to stderr, the JSON array to stdout. Exit 1 on error, 2 on zero results.

## Output
Array of objects. Search card: `asin, url, title, price, currency, listPrice, rating, reviewsCount, boughtLastMonth, isSponsored, thumbnail, position, searchQuery, scrapedAt`.
Product (and cards with `--details`) add: `brand, authors, seller, shipsFrom, isAmazonSeller, availability, inStock, features[], description, breadcrumbs[], bestSellersRank[{rank,category}], mainImage, images[], details{}`.

## Notes
- Prices default to USD (`--currency auto` to let Amazon choose by IP).
- `RefusedError` = Amazon showed this IP a bot check; nothing was reported. Wait and retry, or use another network.
