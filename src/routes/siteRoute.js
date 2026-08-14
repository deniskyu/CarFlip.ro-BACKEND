import { Router } from 'express';
import sales from '../models/salesModel.js';
import { siteLimiter } from '../utils/rateLimiters.js';
import { isValidSlug } from '../utils/slug.js';
import { SITE_CSS, CSS_VERSION } from '../site/styles.js';
import { PAGES_CSS } from '../site/stylesPages.js';
import { renderHome } from '../site/pages/home.js';
import {
    renderStoc, renderMasina, renderMarca, renderContact, renderLegal, renderNotFound,
} from '../site/pages/inner.js';
import { LEGAL_SLUGS } from '../site/legal/texts.js';
import {
    getStockFilters, findBrandBySlug, findModelBySlug,
    brandsWithPages, modelsWithPages, BRAND_PAGE_MIN, MODEL_PAGE_MIN,
} from '../services/stockFilters.js';
import {
    buildMeta, carMetaData, stockMetaData, brandMetaData,
    generateAboutText, buildWhatsappLink, buildAltText, buildBrandIntro,
} from '../services/seo/metaTemplates.js';

// ============================================================================
//  src/routes/siteRoute.js   — versiunea completă (înlocuiește cea din 6a)
// ----------------------------------------------------------------------------
//  Toate paginile site-urilor de parcuri auto.
//
//  ⚠️ ORDINEA RUTELOR CONTEAZĂ. Garda anti-scurgere rămâne ULTIMA în fișier:
//  ea oprește cu 404 orice cale nerezolvată pe un subdomeniu, ca vizitatorul
//  de pe bogdan.car-flip.com să nu primească niciodată conținut CarFlip.
// ============================================================================

const siteRoute = Router();
const PAGE_SIZE = 12;

const fmtPrice = (n) => Number.isFinite(n) ? `${new Intl.NumberFormat('de-DE').format(n)} €` : '';
const fmtNum = (n) => Number.isFinite(n) ? new Intl.NumberFormat('de-DE').format(n) : '';
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const str = (v) => (typeof v === 'string' ? v.trim() : '');

const SORTS = {
    nou: { _id: -1 },
    pret_asc: { price: 1, _id: -1 },
    pret_desc: { price: -1, _id: -1 },
    an_desc: { production_year: -1, _id: -1 },
    km_asc: { mileage: 1, _id: -1 },
};

/**
 * Aceeași transformare document → obiect de afișare ca în siteApiRoute.
 * Formatarea se face aici, nu în componente: prețul și kilometrajul trebuie să
 * apară IDENTIC în HTML, în JSON-LD și în meta tag-uri. Formatate în trei
 * locuri, ar diverge la prima modificare.
 */
const mapCar = (s, parc, full = false) => {
    const o = `https://${parc.subdomain}.car-flip.com`;
    const url = `${o}/masina/${s.slug}`;
    const images = (s.media || []).filter((m) => m.url);
    const cover = images.find((m) => m.type === 'image') || images[0] || null;

    const light = {
        slug: s.slug, url, title: s.title,
        name: [s.brand?.name, s.model?.name].filter(Boolean).join(' '),
        brand: s.brand?.name || '', model: s.model?.name || '',
        year: s.production_year,
        price: s.price, price_fmt: fmtPrice(s.price), negotiable: !!s.negotiable,
        mileage: s.mileage, mileage_fmt: `${fmtNum(s.mileage)} km`,
        fuel: s.engine?.fuel_type || '', capacity: s.engine?.capacity || '',
        horsepower: s.horsepower || null, transmission: s.transmission || '',
        body_type: s.body_type || '',
        cover: cover ? {
            url: cover.url, width: cover.width || null, height: cover.height || null,
            alt: buildAltText(s, parc, 0),
        } : null,
        whatsapp_url: buildWhatsappLink(parc, s, url),
    };
    if (!full) return light;

    return {
        ...light,
        description: s.description || '', color: s.color || '',
        drivetrain: s.drivetrain || '', pollution_standard: s.pollution_standard || '',
        registration_status: s.registration_status || '',
        steering_wheel: s.steering_wheel || 'left',
        exchange_accepted: !!s.exchange_accepted, for_dismante: !!s.for_dismante,
        vin: s.vin || '',
        media: images.map((m, i) => ({
            url: m.url, type: m.type, width: m.width || null, height: m.height || null,
            alt: buildAltText(s, parc, i),
        })),
    };
};

/** Antetul de cache. Site-urile neindexabile nu se cache-uiesc nicăieri. */
const cacheHeader = (parc, indexablePage = true) =>
    parc.indexable && indexablePage
        ? 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
        : 'private, no-store';

const send = (res, parc, html, indexablePage = true) =>
    res.status(200).type('text/html; charset=utf-8')
        .set('Cache-Control', cacheHeader(parc, indexablePage))
        .set('Vary', 'Accept-Encoding')
        .send(html);

// ════════════════════════════════════════════════════════════════════════════
//  FOAIA DE STIL
// ════════════════════════════════════════════════════════════════════════════
// Identică pentru toate site-urile → un fișier, cache de un an. Versiunea e în
// nume, deci o modificare produce un URL nou și nu există risc de CSS vechi.
siteRoute.get(`/assets/site.${CSS_VERSION}.css`, (req, res) => {
    res.status(200).type('text/css')
        .set('Cache-Control', 'public, max-age=31536000, immutable')
        .send(SITE_CSS + PAGES_CSS);
});

// ════════════════════════════════════════════════════════════════════════════
//  ACASĂ
// ════════════════════════════════════════════════════════════════════════════
siteRoute.get('/', siteLimiter, async (req, res, next) => {
    if (!req.isSite || !req.parc) return next();
    const parc = req.parc;
    try {
        const [filters, latest] = await Promise.all([
            getStockFilters(parc.user_id),
            sales.find({ user_id: parc.user_id, is_active: true }).sort({ _id: -1 }).limit(6).lean(),
        ]);
        return send(res, parc, renderHome(parc, {
            meta: buildMeta('home', parc, stockMetaData(filters)),
            total: filters.total,
            about_text: generateAboutText(parc, filters),
            whatsapp_url: buildWhatsappLink(parc, null),
            latest: latest.map((s) => mapCar(s, parc)),
            top_brands: brandsWithPages(filters).slice(0, 6)
                .map((b) => ({ slug: b.slug, name: b.name, count: b.count })),
        }));
    } catch (err) { return next(err); }
});

// ════════════════════════════════════════════════════════════════════════════
//  STOC
// ════════════════════════════════════════════════════════════════════════════
siteRoute.get('/stoc', siteLimiter, async (req, res, next) => {
    if (!req.isSite || !req.parc) return next();
    const parc = req.parc;
    try {
        const filters = await getStockFilters(parc.user_id);
        const q = req.query;
        const query = { user_id: parc.user_id, is_active: true };
        const applied = {};
        const raw = {};

        const bSlug = str(q.marca);
        if (bSlug) {
            const b = findBrandBySlug(filters, bSlug);
            if (b) {
                query['brand.id'] = b.id;
                applied.marca = { slug: b.slug, name: b.name };
                raw.marca = b.slug;
                const mSlug = str(q.model);
                if (mSlug) {
                    const m = findModelBySlug(b, mSlug);
                    if (m) {
                        query['model.id'] = m.id;
                        applied.model = { slug: m.slug, name: m.name };
                        raw.model = m.slug;
                    }
                }
            }
        }

        const range = (key, field, min, max) => {
            const lo = num(q[min]), hi = num(q[max]);
            if (lo === null && hi === null) return;
            query[field] = {};
            if (lo !== null) { query[field].$gte = lo; applied[min] = lo; raw[min] = lo; }
            if (hi !== null) { query[field].$lte = hi; applied[max] = hi; raw[max] = hi; }
        };
        range('pret', 'price', 'pret_min', 'pret_max');
        range('an', 'production_year', 'an_min', 'an_max');

        const km = num(q.km_max);
        if (km !== null) { query.mileage = { $lte: km }; applied.km_max = km; raw.km_max = km; }

        const fuel = str(q.combustibil);
        if (fuel && (filters.fuels || []).includes(fuel)) {
            query['engine.fuel_type'] = fuel; applied.combustibil = fuel; raw.combustibil = fuel;
        }

        const sort = SORTS[str(q.sort)] ? str(q.sort) : 'nou';
        if (sort !== 'nou') raw.sort = sort;

        const page = Math.max(1, num(q.page) || 1);
        const [total, cars] = await Promise.all([
            sales.countDocuments(query),
            sales.find(query).sort(SORTS[sort]).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
        ]);

        return send(res, parc, renderStoc(parc, {
            meta: buildMeta('stoc', parc, stockMetaData(filters)),
            cars: cars.map((s) => mapCar(s, parc)),
            total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
            sort, applied, query: raw, filters,
            whatsapp_url: buildWhatsappLink(parc, null),
        }));
    } catch (err) { return next(err); }
});

// ════════════════════════════════════════════════════════════════════════════
//  PAGINA MAȘINII
// ════════════════════════════════════════════════════════════════════════════
siteRoute.get('/masina/:slug', siteLimiter, async (req, res, next) => {
    if (!req.isSite || !req.parc) return next();
    const parc = req.parc;
    const slug = req.params.slug;
    try {
        if (!isValidSlug(slug)) return notFound(req, res, parc);

        // `user_id` e ÎN filtru, nu într-o verificare ulterioară: un slug de la
        // alt dealer pur și simplu nu se găsește. O verificare uitată nu poate
        // lăsa nimic să treacă.
        const sale = await sales.findOne({ slug, user_id: parc.user_id, is_active: true }).lean();
        if (!sale) return notFound(req, res, parc);

        const base = { user_id: parc.user_id, is_active: true, _id: { $ne: sale._id } };
        let similar = await sales.find({ ...base, 'brand.id': sale.brand?.id })
            .sort({ _id: -1 }).limit(4).lean();
        if (similar.length < 4) {
            const ids = similar.map((s) => s._id);
            similar = similar.concat(await sales.find({ ...base, _id: { $nin: [sale._id, ...ids] } })
                .sort({ _id: -1 }).limit(4 - similar.length).lean());
        }

        const meta = buildMeta('car', parc, carMetaData(sale));
        // Descrierea proprie a dealerului bate șablonul: e text unic, scris de om.
        if (sale.description && sale.description.length > 60) {
            meta.description = sale.description.replace(/\s+/g, ' ').trim().slice(0, 157) + '…';
        }

        const filters = await getStockFilters(parc.user_id);
        const bp = brandsWithPages(filters).find((b) => b.id === sale.brand?.id);

        return send(res, parc, renderMasina(parc, {
            meta, car: mapCar(sale, parc, true), raw: sale,
            similar: similar.map((s) => mapCar(s, parc)),
            brandPage: bp ? bp.slug : null,
            whatsapp_url: buildWhatsappLink(parc, null),
        }));
    } catch (err) { return next(err); }
});

// ════════════════════════════════════════════════════════════════════════════
//  PAGINI DE MARCĂ ȘI MODEL
// ════════════════════════════════════════════════════════════════════════════
const brandHandler = async (req, res, next) => {
    if (!req.isSite || !req.parc) return next();
    const parc = req.parc;
    try {
        const filters = await getStockFilters(parc.user_id);
        const brand = findBrandBySlug(filters, str(req.params.brandSlug));
        if (!brand) return notFound(req, res, parc);

        const modelSlug = str(req.params.modelSlug);
        const model = modelSlug ? findModelBySlug(brand, modelSlug) : null;
        if (modelSlug && !model) return notFound(req, res, parc);

        const count = model ? model.count : brand.count;
        const minimum = model ? MODEL_PAGE_MIN : BRAND_PAGE_MIN;

        // Sub prag: 301 către /stoc filtrat, NU 404. Pagina a existat și a fost
        // probabil indexată; un 404 pierde traficul, un 301 îl păstrează.
        if (count < minimum) {
            const p = new URLSearchParams({ marca: brand.slug });
            if (model) p.set('model', model.slug);
            return res.redirect(301, `/stoc?${p}`);
        }

        const query = { user_id: parc.user_id, is_active: true, 'brand.id': brand.id };
        if (model) query['model.id'] = model.id;

        const sort = SORTS[str(req.query.sort)] ? str(req.query.sort) : 'nou';
        const page = Math.max(1, num(req.query.page) || 1);
        const rawQ = {};
        if (sort !== 'nou') rawQ.sort = sort;

        const [total, cars] = await Promise.all([
            sales.countDocuments(query),
            sales.find(query).sort(SORTS[sort]).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
        ]);

        const meta = model
            ? buildMeta('model', parc, { brand: brand.name, model: model.name, count, ...brandMetaData(brand) })
            : buildMeta('brand', parc, brandMetaData(brand));

        return send(res, parc, renderMarca(parc, {
            meta,
            brand: { slug: brand.slug, name: brand.name, count: brand.count },
            model: model ? { slug: model.slug, name: model.name, count: model.count } : null,
            intro: buildBrandIntro(parc, model ? { ...brand, ...model, count } : brand),
            cars: cars.map((s) => mapCar(s, parc)),
            total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
            query: rawQ,
            siblings: modelsWithPages(brand).filter((m) => !model || m.slug !== model.slug)
                .map((m) => ({ slug: m.slug, name: m.name, count: m.count })),
            other_brands: brandsWithPages(filters).filter((b) => b.slug !== brand.slug).slice(0, 8)
                .map((b) => ({ slug: b.slug, name: b.name, count: b.count })),
            whatsapp_url: buildWhatsappLink(parc, null),
        }));
    } catch (err) { return next(err); }
};

siteRoute.get('/masini/:brandSlug', siteLimiter, brandHandler);
siteRoute.get('/masini/:brandSlug/:modelSlug', siteLimiter, brandHandler);

// ════════════════════════════════════════════════════════════════════════════
//  CONTACT
// ════════════════════════════════════════════════════════════════════════════
siteRoute.get('/contact', siteLimiter, async (req, res, next) => {
    if (!req.isSite || !req.parc) return next();
    const parc = req.parc;
    try {
        const filters = await getStockFilters(parc.user_id);
        return send(res, parc, renderContact(parc, {
            meta: buildMeta('contact', parc, {}),
            about_text: generateAboutText(parc, filters),
            whatsapp_url: buildWhatsappLink(parc, null),
            total: filters.total,
            brands: filters.brands,
        }));
    } catch (err) { return next(err); }
});

// ════════════════════════════════════════════════════════════════════════════
//  PAGINI LEGALE
// ════════════════════════════════════════════════════════════════════════════
siteRoute.get('/:slug', siteLimiter, (req, res, next) => {
    if (!req.isSite || !req.parc) return next();
    const slug = str(req.params.slug);
    if (!LEGAL_SLUGS.includes(slug)) return next();

    const parc = req.parc;
    const html = renderLegal(parc, slug, { whatsapp_url: buildWhatsappLink(parc, null) });
    if (!html) return next();

    return res.status(200).type('text/html; charset=utf-8')
        .set('Cache-Control', parc.indexable
            ? 'public, max-age=3600, s-maxage=86400'   // textele legale se schimbă foarte rar
            : 'private, no-store')
        .send(html);
});

// ════════════════════════════════════════════════════════════════════════════
//  404 ÎN INTERIORUL SITE-ULUI
// ════════════════════════════════════════════════════════════════════════════
/**
 * Păstrează header, footer și navigație, și oferă mașini reale în loc de un
 * drum înfundat. Cea mai frecventă cauză a unui 404 aici e un anunț șters după
 * ce a fost dat pe Facebook: vizitatorul a venit pentru o mașină anume, iar
 * dacă îi arăți altele patru din stoc, o parte rămân.
 *
 * Status HTTP 404 REAL. Un „soft 404" (status 200 cu text de eroare) face
 * Google să indexeze pagini inexistente și strică semnalele de calitate ale
 * întregului domeniu car-flip.com.
 */
async function notFound(req, res, parc) {
    let cars = [];
    try {
        const list = await sales.find({ user_id: parc.user_id, is_active: true })
            .sort({ _id: -1 }).limit(4).lean();
        cars = list.map((s) => mapCar(s, parc));
    } catch { /* 404-ul trebuie să funcționeze chiar dacă baza de date nu răspunde */ }

    return res.status(404).type('text/html; charset=utf-8')
        .set('X-Robots-Tag', 'noindex, nofollow')
        .set('Cache-Control', 'public, max-age=60')
        .send(renderNotFound(parc, { cars, whatsapp_url: buildWhatsappLink(parc, null) }));
}

// ════════════════════════════════════════════════════════════════════════════
//  GARDA ANTI-SCURGERE — RĂMÂNE ULTIMA ÎN FIȘIER
// ════════════════════════════════════════════════════════════════════════════
// Fără ea, request-urile ar curge în `indexRoute` și un vizitator de pe
// bogdan.car-flip.com ar primi landing page-ul CarFlip sau paginile de
// deep-link — conținut care nu are ce căuta pe site-ul unui dealer.
siteRoute.use(async (req, res, next) => {
    if (!req.isSite) return next();
    if (req.path.startsWith('/api/')) return next();
    if (req.path.startsWith('/.well-known/')) return next();
    if (req.path.startsWith('/assets/')) return next();
    return notFound(req, res, req.parc);
});

export default siteRoute;
