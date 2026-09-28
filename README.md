# Amazon Scraper (Node.js): search results and product data as JSON

Scrape Amazon.com search results and product pages into clean JSON: title, price, currency, list price, star rating, review count, "bought in past month", sponsored flag, seller, availability, feature bullets, Best Sellers Rank, images and the full product details table. No headless browser, no proxy pool to rent: each page is requested from your own machine through a public [Unbrowse](https://unbrowse.ai) tool, and parsed locally.

## Quick start

```bash
git clone https://github.com/unbrowse-ai/amazon-scraper && cd amazon-scraper && npm install
export UNBROWSE_API_KEY=ub_live_...        # free key: https://unbrowse.ai

node index.mjs "wireless earbuds" --max 40 > earbuds.json
node index.mjs https://www.amazon.com/dp/B0D4Z9RPT8 > product.json
node index.mjs "standing desk" --max 20 --details > desks.json
```

| Option | Default | Meaning |
|---|---|---|
| `<input>...` | | Search terms, an amazon.com search or category URL, a product URL, or a bare ASIN |
| `--max N` | 48 | Result cards per search; follows "Next" pages (16-22 cards each) |
| `--details` | off | Also read each product page (one more call per result) |
| `--currency C` | USD | Currency Amazon prices in; `auto` lets Amazon pick from your IP |

From code:

```js
import { scrapeSearch, scrapeProduct } from "./index.mjs";
const cards = await scrapeSearch("mechanical keyboard", { max: 30 });
const product = await scrapeProduct("B0D4Z9RPT8");
```

## Output

A search result card:

```json
{
  "asin": "B0HC642F1C",
  "url": "https://www.amazon.com/dp/B0HC642F1C",
  "title": "HAOYUYAN Wireless Earbuds, Sports Bluetooth Headphones, 80Hrs Playtime ...",
  "price": 23.98,
  "currency": "USD",
  "listPrice": 299.99,
  "rating": 4.7,
  "reviewsCount": 84,
  "boughtLastMonth": "2K+",
  "isSponsored": false,
  "thumbnail": "https://m.media-amazon.com/images/I/71cmAChhQKL._AC_UY218_.jpg",
  "position": 2,
  "searchQuery": "wireless earbuds",
  "scrapedAt": "2026-09-28T04:12:40.225Z"
}
```

A product page (trimmed):

```json
{
  "asin": "B0D4Z9RPT8",
  "title": "Anker Prime USB C to USB C Cable, 240W Fast Charging Durable Cable (6 ft)",
  "brand": "Anker",
  "price": 34.99,
  "currency": "USD",
  "rating": 4.8,
  "reviewsCount": 3442,
  "availability": "In Stock",
  "seller": "AnkerDirect",
  "shipsFrom": "Amazon",
  "features": ["Ultra-Powerful 240W Charging: ...", "..."],
  "breadcrumbs": ["Electronics", "Computers & Accessories", "...", "USB Cables"],
  "bestSellersRank": [{ "rank": 54, "category": "USB Cables" }],
  "images": ["https://m.media-amazon.com/images/I/81joDZuXghL._SL1500_.jpg", "..."],
  "details": { "Model": "A88E2", "Wattage": "240 watts", "UPC": "194644054557" }
}
```

## Fields

| Field | Where | Notes |
|---|---|---|
| `asin`, `url`, `title` | both | ASIN is Amazon's 10-character product id |
| `price`, `currency`, `listPrice` | both | `listPrice` only when above `price` (a strike-through price) |
| `rating`, `reviewsCount` | both | Stars out of 5, number of ratings |
| `boughtLastMonth`, `isSponsored`, `position` | search | As Amazon shows them ("2K+") |
| `brand`, `authors`, `seller`, `shipsFrom`, `isAmazonSeller` | product | `authors` for books |
| `availability`, `inStock` | product | Text as shown, plus a boolean |
| `features`, `description`, `breadcrumbs` | product | Bullet points, long description, category path |
| `bestSellersRank` | product | `[{ rank, category }]` |
| `mainImage`, `images` | product | Full-size image URLs |
| `details` | product | Every row of the product details table |

## FAQ

**Why do I need an API key?** Pages are fetched through Unbrowse's public `amazon.com` tool, which tells your machine what to request. The key is free and the request itself leaves from your IP.

**Prices came back in SGD / EUR.** Amazon picks a currency from your IP. The scraper pins USD with Amazon's own preference cookie; pass `--currency EUR` or `--currency auto` to change that. The `currency` field always says what you got.

**What if Amazon shows a captcha?** The scraper stops that page, closes the session without reporting anything back, and throws `RefusedError`. Retry later or from another network. See [CONTRIBUTING](https://github.com/unbrowse-ai/open-scrapers/blob/master/CONTRIBUTING.md) for why a refused page is never posted.

**Other Amazon stores?** The public tool covers amazon.com. The parser also reads amazon.de and amazon.ca pages if you fetch them yourself.

**Is this allowed?** It reads public pages at a human pace. Check Amazon's terms for your use case and do not collect personal data.

---

Part of [open-scrapers](https://github.com/unbrowse-ai/open-scrapers): more scrapers and a catalog of 2,400+ websites callable as APIs or MCP servers.
