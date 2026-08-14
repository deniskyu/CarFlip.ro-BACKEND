import { Router } from 'express';
import sales from '../models/salesModel.js';
import { siteLimiter } from '../utils/rateLimiters.js';
import { isValidSlug } from '../utils/slug.js';
import {
    getStockFilters, findBrandBySlug, findModelBySlug,
    brandsWithPages, modelsWithPages, BRAND_PAGE_MIN, MODEL_PAGE_MIN,
} from '../services/stockFilters.js';
import {
    buildMeta, carMetaData, stockMetaData, brandMetaData,
    generateAboutText, buildAltText, buildWhatsappLink, buildBrandIntro,
} from '../services/seo/metaTemplates.js';

// ============================================================================
//  src/routes/siteApiRoute.js
// ----------------------------------------------------------------------------
//  Datele pe care le consumă template-ul (Batch 6), randate server-side.
//
//  ── DE CE FORMATEAZĂ SERVERUL, NU TEMPLATE-UL ─────────────────────────────
//  Prețul, kilometrajul, linkul WhatsApp cu context, textul alternativ și
//  URL-ul canonic ies de aici gata construite. Motivul e că exact aceleași
//  valori trebuie să apară identic în trei locuri: HTML-ul vizibil, datele
//  structurate și meta tag-urile. Formatate în template, ar diverge la prima
//  modificare, iar Google ar vedea un preț în `<meta>` și altul în JSON-LD.
//
//  ── DE CE PAGINARE CLASICĂ, NU CURSOR ─────────────────────────────────────
//  Sistemul de cursoare din feed e făcut pentru un flux infinit, personalizat,
//  fără URL-uri. Un catalog vrea altceva: „48 de mașini, pagina 2 din 4",
//  partajabil, cu buton „înapoi" funcțional și indexabil. Un cursor opac în URL
//  nu poate fi niciunul dintre astea.
// ============================================================================

const siteApi = Router();

const PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 24;

/** Doar pentru rutele de site. Fără parc rezolvat, nu răspundem. */
const requireParc = (req, res, next) => {
    if (!req.parc) return res.status(404).json({ success: false, message: 'Site inexistent.' });
    next();
};

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const str = (v) => (typeof v === 'string' ? v.trim() : '');

const SORTS = {
    nou:       { _id: -1 },
    pret_asc:  { price: 1, _id: -1 },
    pret_desc: { price: -1, _id: -1 },
    an_desc:   { production_year: -1, _id: -1 },
    km_asc:    { mileage: 1, _id: -1 },
};

const fmtPrice = (n) => Number.isFinite(n) ? `${new Intl.NumberFormat('de-DE').format(n)} €` : '';
const fmtNum = (n) => Number.isFinite(n) ? new Intl.NumberFormat('de-DE').format(n) : '';

/**
 * Transformă un document `sales` în forma consumată de template.
 * @param {boolean} full  true pe pagina de detaliu (include toate pozele și specificațiile)
 */
const mapCar = (sale, parc, full = false) => {
    const base = `https://${parc.subdomain}.car-flip.com`;
    const url = `${base}/masina/${sale.slug}`;
    const images = (sale.media || []).filter((m) => m.url);
    const cover = images.find((m) => m.type === 'image') || images[0] || null;

    const light = {
        slug: sale.slug,
        url,
        title: sale.title,
        name: [sale.brand?.name, sale.model?.name].filter(Boolean).join(' '),
        brand: sale.brand?.name || '',
        model: sale.model?.name || '',
        year: sale.production_year,
        price: sale.price,
        price_fmt: fmtPrice(sale.price),
        negotiable: !!sale.negotiable,
        mileage: sale.mileage,
        mileage_fmt: `${fmtNum(sale.mileage)} km`,
        fuel: sale.engine?.fuel_type || '',
        capacity: sale.engine?.capacity || '',
        horsepower: sale.horsepower || null,
        transmission: sale.transmission || '',
        body_type: sale.body_type || '',
        city: sale.location?.city || '',
        // `width`/`height` vin din DB (le scrie mediaWorker) → zero layout shift,
        // ceea ce Google măsoară direct prin CLS.
        cover: cover ? {
            url: cover.url,
            width: cover.width || null,
            height: cover.height || null,
            alt: buildAltText(sale, parc, 0),
        } : null,
        whatsapp_url: buildWhatsappLink(parc, sale, url),
    };

    if (!full) return light;

    return {
        ...light,
        description: sale.description || '',
        color: sale.color || '',
        drivetrain: sale.drivetrain || '',
        pollution_standard: sale.pollution_standard || '',
        registration_status: sale.registration_status || '',
        steering_wheel: sale.steering_wheel || 'left',
        exchange_accepted: !!sale.exchange_accepted,
        for_dismante: !!sale.for_dismante,
        vin: sale.vin || '',
        created_at: sale.createdAt,
        updated_at: sale.updatedAt,
        media: images.map((m, i) => ({
            url: m.url,
            type: m.type,
            width: m.width || null,
            height: m.height || null,
            alt: buildAltText(sale, parc, i),
        })),
    };
};

/** Construiește filtrul Mongo din query string. Toate valorile trec prin guard. */
const buildQuery = (parc, q, filters) => {
    const query = { user_id: parc.user_id, is_active: true };
    const applied = {};

    const marcaSlug = str(q.marca);
    if (marcaSlug) {
        const b = findBrandBySlug(filters, marcaSlug);
        if (b) {
            query['brand.id'] = b.id;
            applied.marca = { slug: b.slug, name: b.name };

            const modelSlug = str(q.model);
            if (modelSlug) {
                const m = findModelBySlug(b, modelSlug);
                if (m) {
                    query['model.id'] = m.id;
                    applied.model = { slug: m.slug, name: m.name };
                }
            }
        }
    }

    const pmin = num(q.pret_min), pmax = num(q.pret_max);
    if (pmin !== null || pmax !== null) {
        query.price = {};
        if (pmin !== null) { query.price.$gte = pmin; applied.pret_min = pmin; }
        if (pmax !== null) { query.price.$lte = pmax; applied.pret_max = pmax; }
    }

    const amin = num(q.an_min), amax = num(q.an_max);
    if (amin !== null || amax !== null) {
        query.production_year = {};
        if (amin !== null) { query.production_year.$gte = amin; applied.an_min = amin; }
        if (amax !== null) { query.production_year.$lte = amax; applied.an_max = amax; }
    }

    const kmax = num(q.km_max);
    if (kmax !== null) { query.mileage = { $lte: kmax }; applied.km_max = kmax; }

    const fuel = str(q.combustibil);
    if (fuel && (filters.fuels || []).includes(fuel)) {
        query['engine.fuel_type'] = fuel;
        applied.combustibil = fuel;
    }

    return { query, applied };
};

// ════════════════════════════════════════════════════════════════════════════

/** GET /api/site/filtre — opțiunile de filtrare, doar din stocul dealerului. */
siteApi.get('/api/site/filtre', siteLimiter, requireParc, async (req, res) => {
    try {
        const filters = await getStockFilters(req.parc.user_id);
        return res.json({
            success: true,
            filters,
            brand_pages: brandsWithPages(filters).map((b) => ({
                slug: b.slug, name: b.name, count: b.count,
                models: modelsWithPages(b).map((m) => ({ slug: m.slug, name: m.name, count: m.count })),
            })),
        });
    } catch (err) {
        console.error('[siteApi] filtre:', err.message);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});

/** GET /api/site/home — tot ce trebuie pentru pagina de acasă, într-un singur apel. */
siteApi.get('/api/site/home', siteLimiter, requireParc, async (req, res) => {
    try {
        const parc = req.parc;
        const filters = await getStockFilters(parc.user_id);

        const latest = await sales.find({ user_id: parc.user_id, is_active: true })
            .sort({ _id: -1 }).limit(6).lean();

        const meta = buildMeta('home', parc, stockMetaData(filters));

        return res.json({
            success: true,
            meta,
            total: filters.total,
            about_text: generateAboutText(parc, filters),
            whatsapp_url: buildWhatsappLink(parc, null),
            latest: latest.map((s) => mapCar(s, parc)),
            top_brands: brandsWithPages(filters).slice(0, 6)
                .map((b) => ({ slug: b.slug, name: b.name, count: b.count })),
        });
    } catch (err) {
        console.error('[siteApi] home:', err.message);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});

/** GET /api/site/stoc — catalogul, cu filtre și paginare clasică. */
siteApi.get('/api/site/stoc', siteLimiter, requireParc, async (req, res) => {
    try {
        const parc = req.parc;
        const filters = await getStockFilters(parc.user_id);
        const { query, applied } = buildQuery(parc, req.query, filters);

        const sortKey = SORTS[str(req.query.sort)] ? str(req.query.sort) : 'nou';
        const sort = SORTS[sortKey];

        const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, num(req.query.limit) || PAGE_SIZE));
        const page = Math.max(1, num(req.query.page) || 1);

        const [total, cars] = await Promise.all([
            sales.countDocuments(query),
            sales.find(query).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
        ]);

        const pages = Math.max(1, Math.ceil(total / limit));
        const meta = buildMeta('stoc', parc, stockMetaData(filters));

        return res.json({
            success: true,
            meta,
            cars: cars.map((s) => mapCar(s, parc)),
            total,
            page,
            pages,
            limit,
            sort: sortKey,
            applied,
            // Filtrele rămân cele ale stocului COMPLET, nu ale rezultatului
            // curent — altfel, după prima selecție, utilizatorul nu ar mai
            // putea schimba marca fără să reseteze tot.
            filters,
        });
    } catch (err) {
        console.error('[siteApi] stoc:', err.message);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});

/** GET /api/site/masina/:slug — detaliul unei mașini + 4 similare. */
siteApi.get('/api/site/masina/:slug', siteLimiter, requireParc, async (req, res) => {
    const { slug } = req.params;
    if (!isValidSlug(slug)) {
        return res.status(404).json({ success: false, message: 'Anunț inexistent.' });
    }
    try {
        const parc = req.parc;

        // `user_id` face parte din filtru, nu dintr-o verificare ulterioară:
        // un slug de la alt dealer pur și simplu nu se găsește.
        const sale = await sales.findOne({ slug, user_id: parc.user_id, is_active: true }).lean();
        if (!sale) return res.status(404).json({ success: false, message: 'Anunț indisponibil.' });

        // Similare: aceeași marcă întâi; dacă nu ajung, completăm cu orice.
        const similarQuery = {
            user_id: parc.user_id, is_active: true, _id: { $ne: sale._id },
        };
        let similar = await sales.find({ ...similarQuery, 'brand.id': sale.brand?.id })
            .sort({ _id: -1 }).limit(4).lean();
        if (similar.length < 4) {
            const ids = similar.map((s) => s._id);
            const more = await sales.find({ ...similarQuery, _id: { $nin: [sale._id, ...ids] } })
                .sort({ _id: -1 }).limit(4 - similar.length).lean();
            similar = [...similar, ...more];
        }

        const car = mapCar(sale, parc, true);
        const meta = buildMeta('car', parc, carMetaData(sale));
        // Descrierea proprie a dealerului bate șablonul: e text unic, scris de om.
        if (sale.description && sale.description.length > 60) {
            meta.description = sale.description.replace(/\s+/g, ' ').trim().slice(0, 157) + '…';
        }

        return res.json({
            success: true,
            meta,
            car,
            raw: sale,          // documentul brut, pentru JSON-LD (Batch 6)
            similar: similar.map((s) => mapCar(s, parc)),
        });
    } catch (err) {
        console.error('[siteApi] masina:', err.message);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});

/**
 * GET /api/site/marca/:brandSlug[/:modelSlug]
 *
 * Paginile generate automat din stoc — cea mai puternică piesă de SEO din
 * proiect. Un dealer cu 40 de mașini din 8 mărci obține 8–15 pagini reale de
 * conținut fără să scrie un cuvânt, iar ele țintesc exact căutările cu intenție
 * de cumpărare: „bmw seria 3 second hand craiova".
 *
 * Sub prag, ruta întoarce `redirect` în loc de 404: template-ul emite 301 către
 * `/stoc` filtrat. Un 404 pe un URL care a existat și a fost indexat pierde
 * traficul; un 301 îl păstrează.
 */
const brandPage = async (req, res) => {
    const parc = req.parc;
    const brandSlug = str(req.params.brandSlug);
    const modelSlug = str(req.params.modelSlug);

    try {
        const filters = await getStockFilters(parc.user_id);
        const brand = findBrandBySlug(filters, brandSlug);
        if (!brand) return res.status(404).json({ success: false, message: 'Marcă inexistentă în stoc.' });

        const model = modelSlug ? findModelBySlug(brand, modelSlug) : null;
        if (modelSlug && !model) {
            return res.status(404).json({ success: false, message: 'Model inexistent în stoc.' });
        }

        const count = model ? model.count : brand.count;
        const minimum = model ? MODEL_PAGE_MIN : BRAND_PAGE_MIN;
        if (count < minimum) {
            const q = new URLSearchParams({ marca: brand.slug });
            if (model) q.set('model', model.slug);
            return res.json({ success: true, redirect: `/stoc?${q}` });
        }

        const page = Math.max(1, num(req.query.page) || 1);
        const query = { user_id: parc.user_id, is_active: true, 'brand.id': brand.id };
        if (model) query['model.id'] = model.id;

        const sortKey = SORTS[str(req.query.sort)] ? str(req.query.sort) : 'nou';
        const [total, cars] = await Promise.all([
            sales.countDocuments(query),
            sales.find(query).sort(SORTS[sortKey]).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
        ]);

        const meta = model
            ? buildMeta('model', parc, { brand: brand.name, model: model.name, count, ...brandMetaData(brand) })
            : buildMeta('brand', parc, brandMetaData(brand));

        return res.json({
            success: true,
            meta,
            brand: { slug: brand.slug, name: brand.name, count: brand.count },
            model: model ? { slug: model.slug, name: model.name, count: model.count } : null,
            intro: buildBrandIntro(parc, model ? { ...brand, ...model, count } : brand),
            cars: cars.map((s) => mapCar(s, parc)),
            total, page,
            pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
            sort: sortKey,
            siblings: modelsWithPages(brand)
                .filter((m) => !model || m.slug !== model.slug)
                .map((m) => ({ slug: m.slug, name: m.name, count: m.count })),
            other_brands: brandsWithPages(filters)
                .filter((b) => b.slug !== brand.slug).slice(0, 8)
                .map((b) => ({ slug: b.slug, name: b.name, count: b.count })),
        });
    } catch (err) {
        console.error('[siteApi] marca:', err.message);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
};

siteApi.get('/api/site/marca/:brandSlug', siteLimiter, requireParc, brandPage);
siteApi.get('/api/site/marca/:brandSlug/:modelSlug', siteLimiter, requireParc, brandPage);

/** GET /api/site/contact */
siteApi.get('/api/site/contact', siteLimiter, requireParc, async (req, res) => {
    try {
        const parc = req.parc;
        const filters = await getStockFilters(parc.user_id);
        return res.json({
            success: true,
            meta: buildMeta('contact', parc, {}),
            about_text: generateAboutText(parc, filters),
            whatsapp_url: buildWhatsappLink(parc, null),
            total: filters.total,
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});

export default siteApi;
