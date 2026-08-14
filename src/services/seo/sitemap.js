import sales from '../../models/salesModel.js';
import { getStockFilters, brandsWithPages, modelsWithPages } from '../stockFilters.js';

// ============================================================================
//  src/services/seo/sitemap.js
// ----------------------------------------------------------------------------
//  sitemap.xml și robots.txt generate DINAMIC, per hostname.
//
//  Nu pot fi fișiere statice: fiecare subdomeniu are alt stoc, alte pagini de
//  marcă și alt `indexable`. Un singur fișier static ar fi greșit pentru toți.
//
//  ── PAGINILE DE MARCĂ ÎN SITEMAP ──────────────────────────────────────────
//  Intră doar cele care există în acel moment (marca are ≥3 mașini). Dacă
//  dealerul vinde ultimele două BMW-uri, pagina dispare de pe site ȘI din
//  sitemap în aceeași clipă. Un sitemap care listează URL-uri care întorc 301
//  sau 404 pierde încredere la Google.
// ============================================================================

const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const iso = (d) => {
    const t = d ? new Date(d) : null;
    return t && !Number.isNaN(t.getTime()) ? t.toISOString().split('T')[0] : null;
};

const url = (loc, { lastmod, changefreq, priority } = {}) => {
    let x = `  <url>\n    <loc>${esc(loc)}</loc>\n`;
    if (lastmod) x += `    <lastmod>${lastmod}</lastmod>\n`;
    if (changefreq) x += `    <changefreq>${changefreq}</changefreq>\n`;
    if (priority) x += `    <priority>${priority}</priority>\n`;
    return x + '  </url>\n';
};

/**
 * Construiește sitemap-ul complet al unui site.
 * @param {object} parc
 * @returns {Promise<string>} XML
 */
export const buildSitemap = async (parc) => {
    const base = `https://${parc.subdomain}.car-flip.com`;

    const [cars, filters] = await Promise.all([
        sales.find({ user_id: parc.user_id, is_active: true })
            .select('slug updatedAt createdAt')
            .sort({ _id: -1 })
            .limit(5000)     // limita protocolului e 50.000; 5.000 e mult peste orice dealer real
            .lean(),
        getStockFilters(parc.user_id),
    ]);

    const newest = cars.length ? iso(cars[0].updatedAt || cars[0].createdAt) : iso(parc.updatedAt);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">\n'
        .replace('www.sitemap.org', 'www.sitemaps.org');

    xml += url(`${base}/`, { lastmod: newest, changefreq: 'daily', priority: '1.0' });
    xml += url(`${base}/stoc`, { lastmod: newest, changefreq: 'daily', priority: '0.9' });
    xml += url(`${base}/contact`, { lastmod: iso(parc.updatedAt), changefreq: 'monthly', priority: '0.6' });

    // Pagini de marcă și model — doar cele care există efectiv acum.
    for (const b of brandsWithPages(filters)) {
        xml += url(`${base}/masini/${b.slug}`, { lastmod: newest, changefreq: 'weekly', priority: '0.7' });
        for (const m of modelsWithPages(b)) {
            xml += url(`${base}/masini/${b.slug}/${m.slug}`, { lastmod: newest, changefreq: 'weekly', priority: '0.6' });
        }
    }

    for (const c of cars) {
        if (!c.slug) continue;   // anunțuri dinainte de backfill, dacă mai există
        xml += url(`${base}/masina/${c.slug}`, {
            lastmod: iso(c.updatedAt || c.createdAt),
            changefreq: 'weekly',
            priority: '0.8',
        });
    }

    for (const p of ['termeni', 'confidentialitate', 'cookies']) {
        xml += url(`${base}/${p}`, { changefreq: 'yearly', priority: '0.3' });
    }

    xml += '</urlset>\n';
    return xml;
};

/**
 * robots.txt — poarta reală de indexare.
 *
 * Când `indexable` e false, blocăm TOT. Motivul e explicat pe larg în
 * services/indexableCheck.js: Google atribuie semnale de calitate la nivel de
 * domeniu, iar 200 de subdomenii subțiri pot penaliza rădăcina car-flip.com,
 * adică toți clienții deodată.
 */
export const buildRobots = (parc) => {
    const base = `https://${parc.subdomain}.car-flip.com`;

    if (!parc.indexable || parc.active === false) {
        return [
            '# Site în pregătire — conținut insuficient pentru indexare.',
            'User-agent: *',
            'Disallow: /',
            '',
        ].join('\n');
    }

    return [
        'User-agent: *',
        'Allow: /',
        '',
        '# Panoul dealerului nu are ce căuta în index.',
        'Disallow: /admin',
        'Disallow: /admin/',
        '',
        '# Rezultate filtrate: conținut duplicat față de /stoc.',
        'Disallow: /*?marca=',
        'Disallow: /*?model=',
        'Disallow: /*?sort=',
        '',
        `Sitemap: ${base}/sitemap.xml`,
        '',
    ].join('\n');
};

export default { buildSitemap, buildRobots };
