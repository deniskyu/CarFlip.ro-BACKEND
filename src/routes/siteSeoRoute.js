import { Router } from 'express';
import { siteLimiter } from '../utils/rateLimiters.js';
import { buildSitemap, buildRobots } from '../services/seo/sitemap.js';
import { getIndexNowKey, isIndexNowConfigured } from '../services/seo/indexnow.js';

// ============================================================================
//  src/routes/siteSeoRoute.js
// ----------------------------------------------------------------------------
//  sitemap.xml, robots.txt și fișierul de verificare IndexNow.
//
//  Toate trei sunt generate per hostname, nu servite static: fiecare subdomeniu
//  are alt stoc, alte pagini de marcă și alt `indexable`.
// ============================================================================

const siteSeo = Router();

/** GET /sitemap.xml */
siteSeo.get('/sitemap.xml', siteLimiter, async (req, res) => {
    if (!req.parc) return res.status(404).type('text/plain').send('Not found');
    try {
        const xml = await buildSitemap(req.parc);
        return res
            .status(200)
            .type('application/xml')
            // Cache scurt: un anunț nou trebuie să apară repede în sitemap, dar
            // nu vrem ca fiecare trecere de crawler să declanșeze o agregare.
            .set('Cache-Control', 'public, max-age=900')
            .send(xml);
    } catch (err) {
        console.error('[siteSeo] sitemap:', err.message);
        return res.status(500).type('text/plain').send('Eroare la generarea sitemap-ului.');
    }
});

/** GET /robots.txt */
siteSeo.get('/robots.txt', siteLimiter, (req, res) => {
    if (!req.parc) return res.status(404).type('text/plain').send('Not found');
    return res
        .status(200)
        .type('text/plain')
        .set('Cache-Control', 'public, max-age=3600')
        .send(buildRobots(req.parc));
});

/**
 * GET /<cheie>.txt — verificarea de proprietate pentru IndexNow.
 *
 * Motorul cere `https://<host>/<cheie>.txt` și așteaptă exact cheia în corp.
 * Cum toate subdomeniile sunt servite de același Express, ruta răspunde pentru
 * oricare host, fără fișiere per site.
 *
 * ⚠️ FĂRĂ regex în parametrul de rută. Express 5 folosește path-to-regexp v8,
 * care a ELIMINAT complet sintaxa `:param(regex)` — o rută scrisă așa aruncă
 * la înregistrare și omoară procesul la pornire, nu la primul request.
 *
 * Soluția: parametru simplu, iar validarea se face în corpul handler-ului.
 * Comparația e oricum strictă (cheia exactă din env), deci pattern-ul din rută
 * nu adăuga securitate — doar filtra mai devreme.
 */
siteSeo.get('/:file', siteLimiter, (req, res, next) => {
    const file = req.params.file;

    // Orice nu arată a `<cheie>.txt` merge mai departe către rutele următoare,
    // ca ruta asta să nu înghită paginile legale sau alte căi de un segment.
    if (!file.endsWith('.txt')) return next();
    if (!req.parc || !isIndexNowConfigured()) return next();

    if (file.slice(0, -4) !== getIndexNowKey()) {
        return next();
    }

    return res
        .status(200)
        .type('text/plain')
        .set('Cache-Control', 'public, max-age=86400')
        .send(getIndexNowKey());
});

export default siteSeo;import { Router } from 'express';
import { siteLimiter } from '../utils/rateLimiters.js';
import { buildSitemap, buildRobots } from '../services/seo/sitemap.js';
import { getIndexNowKey, isIndexNowConfigured } from '../services/seo/indexnow.js';

// ============================================================================
//  src/routes/siteSeoRoute.js
// ----------------------------------------------------------------------------
//  sitemap.xml, robots.txt și fișierul de verificare IndexNow.
//
//  Toate trei sunt generate per hostname, nu servite static: fiecare subdomeniu
//  are alt stoc, alte pagini de marcă și alt `indexable`.
// ============================================================================

const siteSeo = Router();

/** GET /sitemap.xml */
siteSeo.get('/sitemap.xml', siteLimiter, async (req, res) => {
    if (!req.parc) return res.status(404).type('text/plain').send('Not found');
    try {
        const xml = await buildSitemap(req.parc);
        return res
            .status(200)
            .type('application/xml')
            // Cache scurt: un anunț nou trebuie să apară repede în sitemap, dar
            // nu vrem ca fiecare trecere de crawler să declanșeze o agregare.
            .set('Cache-Control', 'public, max-age=900')
            .send(xml);
    } catch (err) {
        console.error('[siteSeo] sitemap:', err.message);
        return res.status(500).type('text/plain').send('Eroare la generarea sitemap-ului.');
    }
});

/** GET /robots.txt */
siteSeo.get('/robots.txt', siteLimiter, (req, res) => {
    if (!req.parc) return res.status(404).type('text/plain').send('Not found');
    return res
        .status(200)
        .type('text/plain')
        .set('Cache-Control', 'public, max-age=3600')
        .send(buildRobots(req.parc));
});

/**
 * GET /<cheie>.txt — verificarea de proprietate pentru IndexNow.
 *
 * Motorul cere `https://<host>/<cheie>.txt` și așteaptă exact cheia în corp.
 * Cum toate subdomeniile sunt servite de același Express, ruta răspunde pentru
 * oricare host, fără fișiere per site.
 *
 * ⚠️ FĂRĂ regex în parametrul de rută. Express 5 folosește path-to-regexp v8,
 * care a ELIMINAT complet sintaxa `:param(regex)` — o rută scrisă așa aruncă
 * la înregistrare și omoară procesul la pornire, nu la primul request.
 *
 * Soluția: parametru simplu, iar validarea se face în corpul handler-ului.
 * Comparația e oricum strictă (cheia exactă din env), deci pattern-ul din rută
 * nu adăuga securitate — doar filtra mai devreme.
 */
siteSeo.get('/:file', siteLimiter, (req, res, next) => {
    const file = req.params.file;

    // Orice nu arată a `<cheie>.txt` merge mai departe către rutele următoare,
    // ca ruta asta să nu înghită paginile legale sau alte căi de un segment.
    if (!file.endsWith('.txt')) return next();
    if (!req.parc || !isIndexNowConfigured()) return next();

    if (file.slice(0, -4) !== getIndexNowKey()) {
        return next();
    }

    return res
        .status(200)
        .type('text/plain')
        .set('Cache-Control', 'public, max-age=86400')
        .send(getIndexNowKey());
});

export default siteSeo;