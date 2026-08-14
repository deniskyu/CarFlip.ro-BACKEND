import { Router } from 'express';
import sales from '../models/salesModel.js';
import { siteLimiter } from '../utils/rateLimiters.js';
import { renderPageNotFound } from '../utils/siteErrorPages.js';
import { SITE_CSS, CSS_VERSION } from '../site/styles.js';
import { renderHome } from '../site/pages/home.js';
import { getStockFilters, brandsWithPages } from '../services/stockFilters.js';
import {
    buildMeta, stockMetaData, generateAboutText,
    buildWhatsappLink, buildAltText,
} from '../services/seo/metaTemplates.js';

// ============================================================================
//  src/routes/siteRoute.js
// ----------------------------------------------------------------------------
//  Randarea paginilor. Înlocuiește `siteTestRoute.js`, care se ȘTERGE.
//
//  ── DE CE NU CHEAMĂ PROPRIUL API PRIN HTTP ────────────────────────────────
//  Ruta folosește direct aceleași funcții de serviciu pe care le folosește și
//  `/api/site/*`. Un apel HTTP către propriul server ar fi adăugat o rundă de
//  rețea, serializare JSON dus-întors și un punct de eșec, pentru zero câștig.
//
//  API-ul rămâne montat și util: îl folosești la depanare, iar dacă vreodată
//  muți partea de afișare într-un proiect separat, contractul e deja definit.
//
//  ── CACHE LA EDGE ─────────────────────────────────────────────────────────
//  `s-maxage` cu `stale-while-revalidate` lasă Cloudflare să servească pagina
//  din cache, iar la expirare o servește pe cea veche în timp ce o
//  reîmprospătează în fundal. Vizitatorul nu așteaptă niciodată o regenerare.
//  Efectul: serverul e lovit o dată la câteva minute per pagină, nu la fiecare
//  vizitator.
// ============================================================================

const siteRoute = Router();

// ─── Foaia de stil ──────────────────────────────────────────────────────────
// Identică pentru toate site-urile → un singur fișier, cache de un an.
// Versiunea e în nume, deci o modificare a stilului = un URL nou, fără
// invalidări manuale și fără risc de a servi CSS vechi.
siteRoute.get(`/assets/site.${CSS_VERSION}.css`, (req, res) => {
    res.status(200)
        .type('text/css')
        .set('Cache-Control', 'public, max-age=31536000, immutable')
        .send(SITE_CSS);
});

// ─── Pagina de acasă ────────────────────────────────────────────────────────
siteRoute.get('/', siteLimiter, async (req, res, next) => {
    // Domeniul principal → lăsăm rutele existente să răspundă, neatinse.
    if (!req.isSite || !req.parc) return next();

    const parc = req.parc;
    try {
        const [filters, latest] = await Promise.all([
            getStockFilters(parc.user_id),
            sales.find({ user_id: parc.user_id, is_active: true })
                .sort({ _id: -1 }).limit(6).lean(),
        ]);

        const origin = `https://${parc.subdomain}.car-flip.com`;

        const cars = latest.map((s) => {
            const url = `${origin}/masina/${s.slug}`;
            const images = (s.media || []).filter((m) => m.url);
            const cover = images.find((m) => m.type === 'image') || images[0] || null;
            return {
                slug: s.slug,
                url,
                title: s.title,
                name: [s.brand?.name, s.model?.name].filter(Boolean).join(' '),
                year: s.production_year,
                price_fmt: `${new Intl.NumberFormat('de-DE').format(s.price)} €`,
                negotiable: !!s.negotiable,
                mileage_fmt: `${new Intl.NumberFormat('de-DE').format(s.mileage)} km`,
                fuel: s.engine?.fuel_type || '',
                horsepower: s.horsepower || null,
                transmission: s.transmission || '',
                cover: cover ? {
                    url: cover.url,
                    width: cover.width || null,
                    height: cover.height || null,
                    alt: buildAltText(s, parc, 0),
                } : null,
                whatsapp_url: buildWhatsappLink(parc, s, url),
            };
        });

        const data = {
            meta: buildMeta('home', parc, stockMetaData(filters)),
            total: filters.total,
            about_text: generateAboutText(parc, filters),
            whatsapp_url: buildWhatsappLink(parc, null),
            latest: cars,
            top_brands: brandsWithPages(filters).slice(0, 6)
                .map((b) => ({ slug: b.slug, name: b.name, count: b.count })),
        };

        const cache = parc.indexable
            ? 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
            : 'private, no-store';   // site în pregătire: nu se cache-uiește nicăieri

        return res.status(200)
            .type('text/html; charset=utf-8')
            .set('Cache-Control', cache)
            .set('Vary', 'Accept-Encoding')
            .send(renderHome(parc, data));

    } catch (err) {
        console.error(`[siteRoute] home ${parc.subdomain}:`, err);
        return next(err);
    }
});

// ─── Garda anti-scurgere ────────────────────────────────────────────────────
// Orice cale nerezolvată pe un subdomeniu de parc se oprește AICI, cu 404 real.
// Fără ea, request-urile ar curge în `indexRoute` și un vizitator de pe
// bogdan.car-flip.com ar primi landing page-ul CarFlip sau paginile de
// deep-link — conținut care nu are ce căuta pe site-ul unui dealer.
//
// Excepțiile sunt intenționate: API-ul nu depinde de tenant, iar `/.well-known`
// e folosit de verificări externe.
//
// ⚠️ Rămâne ULTIMA în fișier. Paginile din Batch 6b se adaugă DEASUPRA.
siteRoute.use((req, res, next) => {
    if (!req.isSite) return next();
    if (req.path.startsWith('/api/')) return next();
    if (req.path.startsWith('/.well-known/')) return next();
    if (req.path.startsWith('/assets/')) return next();
    return renderPageNotFound(res, req.parc);
});

export default siteRoute;
