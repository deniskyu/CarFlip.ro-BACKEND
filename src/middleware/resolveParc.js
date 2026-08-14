import { getParcBySubdomain } from '../services/parcCache.js';
import { isReservedSubdomain } from '../utils/reservedSubdomains.js';
import { renderSiteNotFound } from '../utils/siteErrorPages.js';

// ============================================================================
//  src/middleware/resolveParc.js
// ----------------------------------------------------------------------------
//  SINGURUL loc din tot proiectul care citește hostname-ul și decide al cui e
//  request-ul. Nicio rută nu are voie să se uite la `req.hostname` după asta —
//  toate folosesc `req.parc`.
//
//  De ce e important că e un singur loc: într-o aplicație multi-tenant, cea mai
//  frecventă breșă de securitate apare exact când două bucăți de cod rezolvă
//  tenantul diferit. Un singur punct de adevăr elimină categoria întreagă de
//  bug-uri.
//
//  Rezultatul pe request:
//    req.parc     → obiectul parcului, sau undefined dacă e domeniul principal
//    req.isSite   → true dacă request-ul aparține unui site de dealer
//
//  Ce se întâmplă cu fiecare tip de host:
//    car-flip.com            → next()  (aplicația existentă, neatinsă)
//    www.car-flip.com        → next()
//    api.car-flip.com        → next()  (subdomeniu rezervat)
//    bogdan.car-flip.com     → req.parc = {...}
//    inexistent.car-flip.com → 404 stilizat, request-ul se oprește aici
//    a.b.car-flip.com        → 404 (al doilea nivel nu e acoperit de SSL)
//    orice altceva           → next()  (IP direct, localhost, domenii custom)
// ============================================================================

const ROOT_DOMAIN = (process.env.SITE_ROOT_DOMAIN || 'car-flip.com').toLowerCase();
const IS_PROD = process.env.NODE_ENV === 'production';

const resolveParc = async (req, res, next) => {
    try {
        // ── Portiță de dezvoltare ───────────────────────────────────────────
        // Permite testarea pe localhost, înainte ca DNS-ul să propage:
        //     http://localhost:4000/?__parc=bogdan
        // Activă STRICT în afara producției. `ecosystem.config.cjs` setează
        // NODE_ENV: 'production', deci pe server nu există.
        if (!IS_PROD && req.query.__parc) {
            const parc = await getParcBySubdomain(String(req.query.__parc));
            if (!parc) return renderSiteNotFound(res);
            req.parc = parc;
            req.isSite = true;
            return next();
        }

        const host = String(req.hostname || '').toLowerCase().trim();
        if (!host) return next();

        // Domeniul principal — aplicația existentă. Nu atingem nimic.
        if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`) return next();

        // Nu e sub domeniul nostru: IP direct, localhost, health check-uri
        // interne, sau (mai târziu) un domeniu propriu de dealer.
        // TODO Batch 9+: aici intră lookup-ul pe `custom_domain`.
        if (!host.endsWith(`.${ROOT_DOMAIN}`)) return next();

        const subdomain = host.slice(0, -(ROOT_DOMAIN.length + 1));

        // Al doilea nivel (a.b.car-flip.com) nu e acoperit de certificatul
        // Universal gratuit de la Cloudflare, deci nici nu-l servim.
        if (!subdomain || subdomain.includes('.')) return renderSiteNotFound(res);

        // Subdomenii rezervate: le lăsăm să curgă mai departe, ca să nu blocăm
        // vreodată infrastructura proprie printr-o intrare greșită în DB.
        if (isReservedSubdomain(subdomain)) return next();

        const parc = await getParcBySubdomain(subdomain);

        // Inexistent SAU dezactivat → identic din exterior. Nu divulgăm
        // diferența: cine a avut un site și nu mai are nu trebuie să apară
        // public ca „suspendat".
        if (!parc || parc.active === false) return renderSiteNotFound(res);

        req.parc = parc;
        req.isSite = true;
        return next();

    } catch (err) {
        // O eroare aici ar rupe TOATE site-urile deodată. Lăsăm request-ul să
        // treacă mai departe: în cel mai rău caz vede pagina domeniului
        // principal, ceea ce e infinit mai bine decât un 500 global.
        console.error('❌ [resolveParc] Eroare neașteptată:', err.message);
        return next();
    }
};

export default resolveParc;
