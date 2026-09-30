import { Actor, log } from 'apify';
import { mapShopifyProduct, mapWooProduct, normalizeStore, parseShopifyPage, parseWooPage, passesFilters, robotsAllows } from './lib.js';

const EVENT = 'product';
const UA = 'Mozilla/5.0 (compatible; store-product-exporter/1.0; Apify actor; +https://apify.com/mmaker-bot)';
const SHOPIFY_LIMIT = 250;
const WOO_LIMIT = 100;

async function get(url, timeoutMs, accept = 'application/json') {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA, accept } });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        return { status: res.status, finalUrl: res.url, text, json, headers: res.headers };
    } catch (err) {
        return { status: 0, finalUrl: url, text: '', json: null, error: err.name === 'AbortError' ? 'timeout' : err.message };
    } finally {
        clearTimeout(t);
    }
}

async function shopifyCurrency(origin, timeoutMs) {
    const r = await get(`${origin}/cart.js`, timeoutMs);
    return (r.json && typeof r.json.currency === 'string') ? r.json.currency : null;
}

// Yields mapped rows page by page; returns via callback so charging stops promptly.
async function exportStore(origin, opts, emit) {
    let robots = null;
    if (opts.respectRobots) {
        const r = await get(`${origin}/robots.txt`, opts.timeoutMs, 'text/plain');
        robots = r.status === 200 ? r.text : null;
    }
    const mapOpts = { descriptionMaxLength: opts.descriptionMaxLength, includeVariants: opts.includeVariants };

    // Shopify first: /products.json is public on most stores.
    let first = robotsAllows(robots, '/products.json') ? await get(`${origin}/products.json?limit=${SHOPIFY_LIMIT}&page=1`, opts.timeoutMs) : null;
    let products = first && first.status === 200 ? parseShopifyPage(first.json) : null;
    if (products) {
        const base = new URL(first.finalUrl).origin;
        const currency = await shopifyCurrency(base, opts.timeoutMs);
        let page = 1;
        let count = 0;
        while (products && products.length) {
            for (const p of products) {
                if (count >= opts.maxProductsPerStore) return { platform: 'shopify', count };
                const row = mapShopifyProduct(p, base, { ...mapOpts, currency });
                if (!passesFilters(row, opts.filters)) continue;
                if (await emit(row)) return { platform: 'shopify', count, stopped: true };
                count++;
            }
            if (products.length < SHOPIFY_LIMIT) break;
            page++;
            const r = await get(`${base}/products.json?limit=${SHOPIFY_LIMIT}&page=${page}`, opts.timeoutMs);
            products = r.status === 200 ? parseShopifyPage(r.json) : null;
        }
        return { platform: 'shopify', count };
    }

    // WooCommerce Store API (public on WooCommerce 4+ unless disabled).
    const wooPath = '/wp-json/wc/store/v1/products';
    if (!robotsAllows(robots, wooPath)) return { platform: null, count: 0, error: 'blocked by robots.txt' };
    first = await get(`${origin}${wooPath}?per_page=${WOO_LIMIT}&page=1`, opts.timeoutMs);
    products = first.status === 200 ? parseWooPage(first.json) : null;
    if (!products) {
        return { platform: null, count: 0, error: first.error || `no public Shopify or WooCommerce product feed (HTTP ${first.status})` };
    }
    const base = new URL(first.finalUrl).origin;
    const totalPages = Number(first.headers?.get('x-wp-totalpages')) || null;
    let page = 1;
    let count = 0;
    while (products && products.length) {
        for (const p of products) {
            if (count >= opts.maxProductsPerStore) return { platform: 'woocommerce', count };
            const row = mapWooProduct(p, base, mapOpts);
            if (!passesFilters(row, opts.filters)) continue;
            if (await emit(row)) return { platform: 'woocommerce', count, stopped: true };
            count++;
        }
        if (products.length < WOO_LIMIT || (totalPages && page >= totalPages)) break;
        page++;
        const r = await get(`${base}${wooPath}?per_page=${WOO_LIMIT}&page=${page}`, opts.timeoutMs);
        products = r.status === 200 ? parseWooPage(r.json) : null;
    }
    return { platform: 'woocommerce', count };
}

await Actor.init();
const input = (await Actor.getInput()) || {};
const raw = [...(input.stores || []), ...(input.startUrls || []).map((s) => (typeof s === 'string' ? s : s?.url))];
const stores = [...new Set(raw.map(normalizeStore).filter(Boolean))];
if (!stores.length) throw new Error('Give at least one store URL or domain in "stores".');

const opts = {
    maxProductsPerStore: Number(input.maxProductsPerStore) > 0 ? Number(input.maxProductsPerStore) : Infinity,
    timeoutMs: Math.min(Math.max(Number(input.timeoutSecs) || 30, 5), 120) * 1000,
    respectRobots: input.respectRobots !== false,
    includeVariants: input.includeVariants !== false,
    descriptionMaxLength: Math.max(Number(input.descriptionMaxLength) || 0, 0),
    filters: { onlyAvailable: Boolean(input.onlyAvailable), onlyOnSale: Boolean(input.onlyOnSale), keyword: (input.keyword || '').trim() },
};
const concurrency = Math.min(Math.max(Number(input.concurrency) || 5, 1), 20);
log.info(`Exporting products from ${stores.length} stores (concurrency ${concurrency})`);

let limitReached = false;
let total = 0;
const summary = [];
async function emit(row) {
    if (limitReached) return true;
    const charge = await Actor.pushData(row, EVENT);
    total++;
    if (charge?.eventChargeLimitReached) limitReached = true;
    if (total % 500 === 0) await Actor.setStatusMessage(`Exported ${total} products`);
    return limitReached;
}

let next = 0;
async function worker() {
    while (next < stores.length && !limitReached) {
        const origin = stores[next++];
        let res;
        try {
            res = await exportStore(origin, opts, emit);
        } catch (err) {
            res = { platform: null, count: 0, error: err.message };
        }
        summary.push({ store: origin, ...res });
        if (res.error) log.warning(`${origin}: ${res.error}`);
        else log.info(`${origin}: ${res.count} products (${res.platform})`);
    }
}
await Promise.all(Array.from({ length: concurrency }, worker));

await Actor.setValue('STORES_SUMMARY', summary);
if (limitReached) log.info('Stopped at the maximum charge set for this run.');
await Actor.setStatusMessage(`Finished: ${total} products from ${summary.filter((s) => s.count).length}/${stores.length} stores`, { isStatusMessageTerminal: true });
await Actor.exit();
