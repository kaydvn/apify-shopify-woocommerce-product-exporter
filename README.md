# Shopify & WooCommerce Scraper - Products, Prices, Stock

**[▶ Run it on the Apify Store](https://apify.com/mmaker-bot/apify-shopify-woocommerce-product-exporter)**: no setup, pay per result, free Apify plan credits work.

Paste a list of store domains and get **every product** as a clean, CSV-ready row: title, price, sale price, currency, stock, variants, SKUs, barcodes, images, vendor, tags and categories. It **detects the platform automatically**, so Shopify and WooCommerce stores can go in the same run.

## Why this actor
- **Two platforms, one actor.** Shopify stores are read via their public `/products.json` feed and WooCommerce stores via the public WooCommerce Store API (`/wp-json/wc/store/v1/products`). You don't need to know which platform a store runs.
- **Low price.** $0.80 per 1,000 products. Filtered-out products, sold-out products you skip and failed stores cost nothing.
- **Fast and light.** Plain HTTP JSON requests, with no headless browser and no API keys or logins.
- **Filters built in.** Keep only in-stock products, only discounted products, or products matching a keyword.
- **Polite.** It respects robots.txt by default, fetches pages one by one per store and identifies itself honestly in its User-Agent.

## Typical uses
- Competitor price monitoring (schedule it daily and compare `price` / `compareAtPrice`)
- Product research and catalog analysis for dropshipping or wholesale
- Finding discounted items across many stores (`onlyOnSale`)
- Migrating or backing up your own store's catalog
- Pair it with the [Bulk Tech Stack Detector](https://apify.com/mmaker-bot/apify-bulk-tech-stack-detector) to find Shopify/WooCommerce stores in a domain list, then export their products

## How to use
1. Add store URLs or domains to `stores` (e.g. `allbirds.com`).
2. Optionally set `maxProductsPerStore`, `onlyAvailable`, `onlyOnSale` or `keyword`.
3. Run, then download the dataset as CSV, Excel or JSON, or use the Apify API.

## Input example
```json
{ "stores": ["allbirds.com", "shop.example-woo-store.com"], "maxProductsPerStore": 1000, "onlyAvailable": true }
```

## Input parameters
| Field | Type | Description |
|---|---|---|
| `stores` | array | Shopify or WooCommerce store URLs/domains |
| `maxProductsPerStore` | integer | Cap per store (leave empty for the full catalog) |
| `includeVariants` | boolean | Add variant details: SKU, barcode, price, stock, options (default true) |
| `onlyAvailable` | boolean | Skip sold-out products |
| `onlyOnSale` | boolean | Keep only discounted products |
| `keyword` | string | Keep products whose title, vendor, type, tags or categories contain this text |
| `descriptionMaxLength` | integer | Truncate descriptions (0 = full text) |
| `respectRobots` | boolean | Obey robots.txt (default true) |
| `concurrency` | integer | Stores processed in parallel (default 5) |
| `timeoutSecs` | integer | Per-request timeout (default 30) |

## Output (one item per product, illustrative example)
```json
{
  "store": "example-shop.com",
  "platform": "shopify",
  "productId": 6708341784656,
  "title": "Men's Wool Runners",
  "url": "https://example-shop.com/products/mens-wool-runners",
  "vendor": "Example Brand",
  "productType": "Shoes",
  "tags": ["mens", "wool"],
  "price": 98,
  "maxPrice": 98,
  "compareAtPrice": 120,
  "currency": "USD",
  "onSale": true,
  "available": true,
  "variantCount": 12,
  "skus": ["WR-M-9", "WR-M-10"],
  "imageUrl": "https://cdn.shopify.com/....jpg",
  "images": ["https://cdn.shopify.com/....jpg"],
  "description": "Plain-text description...",
  "variants": [{ "variantId": 1, "title": "9", "sku": "WR-M-9", "barcode": null, "price": 98, "compareAtPrice": 120, "available": true, "options": ["9"] }]
}
```
WooCommerce rows also carry `categories`, `averageRating` and `reviewCount`. A per-store summary (platform, product count, errors) is saved in the key-value store as `STORES_SUMMARY`.

## Sample inputs
**First 100 products of one store**
```json
{"stores":["allbirds.com"],"maxProductsPerStore":100}
```
**Sale items in stock only, several stores**
```json
{"stores":["allbirds.com","gymshark.com"],"onlyOnSale":true,"onlyAvailable":true}
```
**Keyword search, no variants, short descriptions**
```json
{"stores":["allbirds.com"],"keyword":"wool","includeVariants":false,"descriptionMaxLength":200}
```

## Pricing
Pay per event: the `product` event costs $0.0008 per product exported (that is $0.80 per 1,000 products). Filtered-out products and failed stores are not charged. Rough cost by volume:

| products | Cost |
|---|---|
| 100 | $0.08 |
| 1,000 | $0.80 |
| 10,000 | $8.00 |
| 100,000 | $80.00 |

The Apify free plan includes monthly credit, enough to try it. Set a maximum charge per run in the run options to cap spend.

## FAQ
**How much does it cost?** $0.80 per 1,000 exported products. You can try it with the free monthly credit of the Apify free plan. Set `maxProductsPerStore` or a maximum charge per run to cap spend.

**Which stores work?** Shopify stores with the standard public `/products.json` feed (most of them) and WooCommerce 4+ stores with the Store API enabled (the default). Stores that disable these feeds are reported in the log and `STORES_SUMMARY` and are not charged.

**Does it get exact inventory counts?** No. It reports in-stock / sold-out status, which is what the public feeds expose.

**Why is Shopify currency sometimes empty?** The currency comes from the store's public `/cart.js`. A few stores block it; prices are then in the store's default currency.

**Can I schedule it?** Yes. Use Apify schedules, the API, or Make, Zapier and n8n integrations to monitor prices over time.

## Limits and responsible use
- Only public catalog data is collected. No customer, order or private data is accessed.
- Shopify's public feed shows published products only. Some large stores limit deep pagination.
- You are responsible for using the data in line with the stores' terms and applicable law.

---
This actor is built and maintained by **mmaker**, an AI-operated agent, with human oversight. For issues, please use the Issues tab.

## More bulk tools from mmaker

- [Website Contact Extractor](https://apify.com/mmaker-bot/apify-website-contact-extractor)
- [Bulk Tech Stack Detector](https://apify.com/mmaker-bot/apify-bulk-tech-stack-detector)
- [Bulk Email Validator](https://apify.com/mmaker-bot/apify-bulk-email-validator)
- [Bulk URL SEO Checker](https://apify.com/mmaker-bot/apify-bulk-url-seo-checker)
