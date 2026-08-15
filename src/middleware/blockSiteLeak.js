import { renderSiteNotFound } from '../utils/siteErrorPages.js';

// ============================================================================
//  src/middleware/blockSiteLeak.js
// ----------------------------------------------------------------------------
//  Ultima linie de apărare împotriva scurgerii de conținut CarFlip pe
//  subdomeniile dealerilor.
//
//  Se montează IMEDIAT ÎNAINTE de `indexRoute`. Dacă un request ajunge până
//  aici cu un hostname care e subdomeniu de-al nostru, ceva a mers prost mai
//  sus — o rută a chemat `next()` când n-ar fi trebuit, o gardă a fost sărită,
//  o rută nouă a fost adăugată fără verificare.
//
//  ── DE CE O A DOUA APĂRARE ────────────────────────────────────────────────
//  Scurgerea e TĂCUTĂ. Nu produce eroare, nu apare în log-uri, nu declanșează
//  nicio alarmă. Pur și simplu, într-o zi, dealerul deschide site-ul lui și
//  vede pagina CarFlip — și îți trimite captura peste o săptămână, dacă îți
//  trimite.
//
//  Costul acestui fișier e o comparație de șir per request. Costul absenței lui
//  e un client care crede că site-ul pentru care a plătit s-a stricat.
//
//  Excepțiile sunt intenționate:
//    /api/         — API-ul nu depinde de tenant, funcționează pe orice host
//    /.well-known/ — verificări externe (SSL, IndexNow)
//    /assets/      — foaia de stil comună
// ============================================================================

const ROOT_DOMAIN = (process.env.SITE_ROOT_DOMAIN || 'car-flip.com').toLowerCase();

const blockSiteLeak = (req, res, next) => {
    // `isOurSubdomain` e setat de resolveParc. Recalculăm din hostname ca plasă
    // de siguranță și pentru cazul în care resolveParc n-ar fi rulat deloc.
    const host = String(req.hostname || '').toLowerCase();
    const isSub = req.isOurSubdomain === true ||
        (host.endsWith(`.${ROOT_DOMAIN}`) &&
         host !== ROOT_DOMAIN &&
         host !== `www.${ROOT_DOMAIN}`);

    if (!isSub) return next();

    const p = req.path;
    if (p.startsWith('/api/') || p.startsWith('/.well-known/') || p.startsWith('/assets/')) {
        return next();
    }

    // Ajuns aici cu un parc rezolvat înseamnă că o rută de site a chemat
    // `next()` în loc să răspundă. Merită semnalat zgomotos: e un bug.
    if (req.isSite) {
        console.warn(`⚠️ [blockSiteLeak] Cale netratată pe ${host}${p} — o rută de site a chemat next().`);
    }

    return renderSiteNotFound(res);
};

export default blockSiteLeak;
