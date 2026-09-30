// Pure helpers for the Shopify + WooCommerce product exporter.

export function normalizeStore(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let s = raw.trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    try {
        const u = new URL(s);
        if (!u.hostname.includes('.')) return null;
        return u.origin;
    } catch {
        return null;
    }
}

export function stripHtml(html, maxLen = 0) {
    if (!html) return '';
    let t = String(html)
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&rsquo;|&lsquo;/g, "'")
        .replace(/[ \t\r\f\v]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();
    if (maxLen > 0 && t.length > maxLen) t = `${t.slice(0, maxLen - 1)}…`;
    return t;
}

const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

function minOf(values) {
    const xs = values.filter((v) => v !== null);
    return xs.length ? Math.min(...xs) : null;
}

function maxOf(values) {
    const xs = values.filter((v) => v !== null);
    return xs.length ? Math.max(...xs) : null;
}

export function mapShopifyProduct(p, origin, { currency = null, descriptionMaxLength = 0, includeVariants = true } = {}) {
    const variants = (p.variants || []).map((v) => ({
        variantId: v.id,
        title: v.title,
        sku: v.sku || null,
        barcode: v.barcode || null,
        price: num(v.price),
        compareAtPrice: num(v.compare_at_price),
        available: v.available ?? null,
        options: [v.option1, v.option2, v.option3].filter((o) => o !== null && o !== undefined),
        grams: v.grams ?? null,
        requiresShipping: v.requires_shipping ?? null,
    }));
    const prices = variants.map((v) => v.price);
    const compare = variants.map((v) => v.compareAtPrice);
    const price = minOf(prices);
    const compareAtPrice = maxOf(compare);
    const images = (p.images || []).map((i) => i.src).filter(Boolean);
    const avail = variants.map((v) => v.available).filter((a) => a !== null);
    const row = {
        store: new URL(origin).hostname.replace(/^www\./, ''),
        platform: 'shopify',
        productId: p.id,
        title: p.title,
        handle: p.handle || null,
        url: p.handle ? `${origin}/products/${p.handle}` : null,
        vendor: p.vendor || null,
        productType: p.product_type || null,
        tags: Array.isArray(p.tags) ? p.tags : (p.tags ? String(p.tags).split(',').map((t) => t.trim()).filter(Boolean) : []),
        price,
        maxPrice: maxOf(prices),
        compareAtPrice: compareAtPrice !== null && price !== null && compareAtPrice > price ? compareAtPrice : null,
        currency,
        onSale: compareAtPrice !== null && price !== null && compareAtPrice > price,
        available: avail.length ? avail.some(Boolean) : null,
        variantCount: variants.length,
        skus: variants.map((v) => v.sku).filter(Boolean),
        options: (p.options || []).map((o) => ({ name: o.name, values: o.values || [] })),
        imageUrl: images[0] || null,
        images,
        description: stripHtml(p.body_html, descriptionMaxLength),
        createdAt: p.created_at || null,
        updatedAt: p.updated_at || null,
        publishedAt: p.published_at || null,
    };
    if (includeVariants) row.variants = variants;
    return row;
}

// WooCommerce Store API prices are strings in minor units (e.g. "1999" with minor unit 2).
function wooMoney(value, minorUnit) {
    const n = num(value);
    if (n === null) return null;
    return n / 10 ** (Number.isInteger(minorUnit) ? minorUnit : 2);
}

export function mapWooProduct(p, origin, { descriptionMaxLength = 0, includeVariants = true } = {}) {
    const pr = p.prices || {};
    const mu = pr.currency_minor_unit;
    const price = wooMoney(pr.price, mu);
    const regular = wooMoney(pr.regular_price, mu);
    const range = pr.price_range || null;
    const images = (p.images || []).map((i) => i.src).filter(Boolean);
    const variants = (p.variations || []).map((v) => ({
        variantId: v.id,
        attributes: (v.attributes || []).map((a) => ({ name: a.name, value: a.value })),
    }));
    const row = {
        store: new URL(origin).hostname.replace(/^www\./, ''),
        platform: 'woocommerce',
        productId: p.id,
        title: stripHtml(p.name),
        handle: p.slug || null,
        url: p.permalink || null,
        vendor: (p.brands || [])[0]?.name || null,
        productType: p.type || null,
        categories: (p.categories || []).map((c) => c.name),
        tags: (p.tags || []).map((t) => t.name),
        price: range ? wooMoney(range.min_amount, mu) : price,
        maxPrice: range ? wooMoney(range.max_amount, mu) : price,
        compareAtPrice: regular !== null && price !== null && regular > price ? regular : null,
        currency: pr.currency_code || null,
        onSale: Boolean(p.on_sale),
        available: p.is_in_stock ?? p.is_purchasable ?? null,
        variantCount: variants.length,
        skus: p.sku ? [p.sku] : [],
        options: (p.attributes || []).map((a) => ({ name: a.name, values: (a.terms || []).map((t) => t.name) })),
        imageUrl: images[0] || null,
        images,
        description: stripHtml(p.description || p.short_description, descriptionMaxLength),
        averageRating: num(p.average_rating),
        reviewCount: p.review_count ?? null,
        createdAt: null,
        updatedAt: null,
        publishedAt: null,
    };
    if (includeVariants) row.variants = variants;
    return row;
}

// Returns the products array if the body looks like a Shopify /products.json response.
export function parseShopifyPage(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return Array.isArray(body.products) ? body.products : null;
}

// Returns the products array if the body looks like a WooCommerce Store API products response.
export function parseWooPage(body) {
    if (!Array.isArray(body)) return null;
    if (body.length && !body.every((p) => p && typeof p === 'object' && 'id' in p && 'prices' in p)) return null;
    return body;
}

export function passesFilters(row, { onlyAvailable = false, onlyOnSale = false, keyword = '' } = {}) {
    if (onlyAvailable && row.available === false) return false;
    if (onlyOnSale && !row.onSale) return false;
    if (keyword) {
        const k = keyword.toLowerCase();
        const hay = [row.title, row.vendor, row.productType, ...(row.tags || []), ...(row.categories || [])].join(' ').toLowerCase();
        if (!hay.includes(k)) return false;
    }
    return true;
}

export function robotsAllows(robotsTxt, path, agent = 'store-product-exporter') {
    if (!robotsTxt) return true;
    const groups = [];
    let cur = null;
    for (const raw of robotsTxt.split(/\r?\n/)) {
        const line = raw.replace(/#.*/, '').trim();
        const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
        if (!m) continue;
        const key = m[1].toLowerCase();
        if (key === 'user-agent') {
            if (!cur || cur.rules.length) groups.push((cur = { agents: [], rules: [] }));
            cur.agents.push(m[2].toLowerCase());
        } else if (cur && (key === 'allow' || key === 'disallow')) {
            cur.rules.push({ allow: key === 'allow', path: m[2] });
        }
    }
    const group = groups.find((g) => g.agents.some((a) => a !== '*' && agent.toLowerCase().includes(a)))
        || groups.find((g) => g.agents.includes('*'));
    if (!group) return true;
    let best = null;
    for (const r of group.rules) {
        if (!r.path) continue;
        const re = new RegExp(`^${r.path.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}`);
        if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
    }
    return best ? best.allow : true;
}
