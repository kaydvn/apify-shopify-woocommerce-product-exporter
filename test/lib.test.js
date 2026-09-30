import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapShopifyProduct, mapWooProduct, normalizeStore, parseShopifyPage, parseWooPage, passesFilters, robotsAllows, stripHtml } from '../src/lib.js';

const shopify = {
    id: 123, title: 'Wool Runner', handle: 'wool-runner', vendor: 'Allbirds', product_type: 'Shoes',
    tags: ['mens', 'wool'], body_html: '<p>Soft &amp; comfy</p><p>Line two</p>',
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-02-01T00:00:00Z', published_at: '2024-01-02T00:00:00Z',
    options: [{ name: 'Size', values: ['9', '10'] }],
    variants: [
        { id: 1, title: '9', sku: 'WR-9', price: '98.00', compare_at_price: '120.00', available: false, option1: '9', option2: null, option3: null },
        { id: 2, title: '10', sku: 'WR-10', price: '110.00', compare_at_price: null, available: true, option1: '10', option2: null, option3: null },
    ],
    images: [{ src: 'https://cdn.shopify.com/a.jpg' }, { src: 'https://cdn.shopify.com/b.jpg' }],
};

const woo = {
    id: 55, name: 'Hoodie &amp; Cap', slug: 'hoodie', permalink: 'https://shop.example.com/product/hoodie/', type: 'variable',
    description: '<p>Warm</p>', on_sale: true, is_in_stock: true, sku: 'HD-1', average_rating: '4.50', review_count: 3,
    prices: { price: '4500', regular_price: '5000', currency_code: 'EUR', currency_minor_unit: 2, price_range: { min_amount: '4000', max_amount: '4500' } },
    categories: [{ name: 'Clothing' }], tags: [{ name: 'winter' }], brands: [{ name: 'Acme' }],
    attributes: [{ name: 'Color', terms: [{ name: 'Red' }, { name: 'Blue' }] }],
    variations: [{ id: 56, attributes: [{ name: 'Color', value: 'red' }] }],
    images: [{ src: 'https://shop.example.com/h.jpg' }],
};

test('normalizeStore', () => {
    assert.equal(normalizeStore('allbirds.com'), 'https://allbirds.com');
    assert.equal(normalizeStore(' https://shop.example.com/collections/all '), 'https://shop.example.com');
    assert.equal(normalizeStore('localhost'), null);
    assert.equal(normalizeStore(''), null);
    assert.equal(normalizeStore(null), null);
});

test('stripHtml decodes entities and truncates', () => {
    assert.equal(stripHtml('<p>Soft &amp; comfy</p><p>Line two</p>'), 'Soft & comfy\nLine two');
    assert.equal(stripHtml('<script>x()</script>abcdef', 4), 'abc…');
});

test('mapShopifyProduct', () => {
    const r = mapShopifyProduct(shopify, 'https://www.allbirds.com', { currency: 'USD' });
    assert.equal(r.store, 'allbirds.com');
    assert.equal(r.platform, 'shopify');
    assert.equal(r.url, 'https://www.allbirds.com/products/wool-runner');
    assert.equal(r.price, 98);
    assert.equal(r.maxPrice, 110);
    assert.equal(r.compareAtPrice, 120);
    assert.equal(r.onSale, true);
    assert.equal(r.available, true);
    assert.equal(r.currency, 'USD');
    assert.deepEqual(r.skus, ['WR-9', 'WR-10']);
    assert.equal(r.variants.length, 2);
    assert.deepEqual(r.variants[0].options, ['9']);
    assert.equal(r.imageUrl, 'https://cdn.shopify.com/a.jpg');
    assert.equal(r.description, 'Soft & comfy\nLine two');
    assert.equal(mapShopifyProduct(shopify, 'https://a.com', { includeVariants: false }).variants, undefined);
});

test('mapShopifyProduct handles string tags and no sale', () => {
    const p = { ...shopify, tags: 'a, b', variants: [{ id: 1, price: '10', compare_at_price: '10', available: false }] };
    const r = mapShopifyProduct(p, 'https://a.com');
    assert.deepEqual(r.tags, ['a', 'b']);
    assert.equal(r.onSale, false);
    assert.equal(r.compareAtPrice, null);
    assert.equal(r.available, false);
});

test('mapWooProduct converts minor units', () => {
    const r = mapWooProduct(woo, 'https://shop.example.com');
    assert.equal(r.platform, 'woocommerce');
    assert.equal(r.title, 'Hoodie & Cap');
    assert.equal(r.price, 40);
    assert.equal(r.maxPrice, 45);
    assert.equal(r.compareAtPrice, 50);
    assert.equal(r.currency, 'EUR');
    assert.equal(r.vendor, 'Acme');
    assert.deepEqual(r.categories, ['Clothing']);
    assert.deepEqual(r.options, [{ name: 'Color', values: ['Red', 'Blue'] }]);
    assert.equal(r.averageRating, 4.5);
    assert.equal(r.variantCount, 1);
    const jpy = mapWooProduct({ ...woo, prices: { price: '1200', regular_price: '1200', currency_code: 'JPY', currency_minor_unit: 0 } }, 'https://a.jp');
    assert.equal(jpy.price, 1200);
    assert.equal(jpy.compareAtPrice, null);
});

test('page parsers detect the platform', () => {
    assert.deepEqual(parseShopifyPage({ products: [] }), []);
    assert.equal(parseShopifyPage([]), null);
    assert.equal(parseShopifyPage({ code: 'rest_no_route' }), null);
    assert.equal(parseWooPage([woo]).length, 1);
    assert.equal(parseWooPage([{ id: 1, title: { rendered: 'post' } }]), null);
    assert.equal(parseWooPage({ products: [] }), null);
});

test('passesFilters', () => {
    const r = mapShopifyProduct(shopify, 'https://a.com');
    assert.equal(passesFilters(r, { keyword: 'WOOL' }), true);
    assert.equal(passesFilters(r, { keyword: 'boots' }), false);
    assert.equal(passesFilters({ ...r, available: false }, { onlyAvailable: true }), false);
    assert.equal(passesFilters({ ...r, onSale: false }, { onlyOnSale: true }), false);
});

test('robotsAllows', () => {
    const txt = 'User-agent: *\nDisallow: /products.json\nAllow: /wp-json/wc/store/';
    assert.equal(robotsAllows(txt, '/products.json'), false);
    assert.equal(robotsAllows(txt, '/wp-json/wc/store/v1/products'), true);
    assert.equal(robotsAllows(null, '/products.json'), true);
});
