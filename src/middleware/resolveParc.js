import { getParcBySubdomain } from '../services/parcCache.js';
import { isReservedSubdomain } from '../utils/reservedSubdomains.js';
import { renderSiteNotFound, renderSiteError } from '../utils/siteErrorPages.js';

// ============================================================================
//  src/middleware/resolveParc.js   — VERSIUNE CORECTATĂ
// ----------------------------------------------------------------------------
//  SINGURUL loc din tot proiectul care citește hostname-ul și decide al cui e
//  request-ul. Nicio rută nu are voie să se uite la `req.hostname` după asta —
//  toate folosesc `req.parc`.
//
//  ════════════════════════════════════════════════════════════════════════
//  CE S-A CORECTAT FAȚĂ DE VERSIUNEA DIN BATCH 2
//  ════════════════════════════════════════════════════════════════════════
//
//  Simptom: pe `demo.car-flip.com` apărea pagina de start CarFlip, în loc de
//  site-ul dealerului.
//
//  ── Cauza 1: lista de rezervate se verifica ÎNAINTEA parcului ────────────
//  Un subdomeniu rezervat producea `next()` fără `req.isSite`, iar request-ul
//  curgea până la `indexRoute` → pagina CarFlip.
//
//  Scenariul concret: `demo` era în lista de rezervate. L-am scos, tu ai rulat
//  scriptul de creare (proces Node nou, citește fișierul actualizat) și parcul
//  s-a creat. Dar backend-ul rula în continuare cu modulul VECHI în memorie,
//  în care `demo` era încă rezervat. Rezultatul: parc valid în DB, dar
//  `resolveParc` îl trata ca infrastructură și îl lăsa să treacă.
//
//  Ți-am spus atunci că restartul nu e urgent. Era.
//
//  ACUM: parcul se caută PRIMUL. Dacă există și e activ, se servește —
//  indiferent ce zice lista de rezervate. Lista își păstrează rolul real:
//  împiedică CREAREA unui subdomeniu periculos. Dacă lista crește în viitor,
//  site-urile existente nu se mai pot rupe retroactiv.
//
//  ── Cauza 2: blocul catch lăsa request-ul să curgă ──────────────────────
//  Scrisesem că „în cel mai rău caz vede pagina domeniului principal, ceea ce
//  e infinit mai bine decât un 500". Era greșit: exact asta e scurgerea pe care
//  tot sistemul încearcă s-o prevină, și e TĂCUTĂ — nu apare nimic în log-uri
//  în afara unui console.error, iar dealerul îți arată captura peste o
//  săptămână.
//
//  ACUM: dacă știm sigur că hostname-ul e un subdomeniu de-al nostru, o eroare
//  produce o pagină de eroare, nu conținut CarFlip. Un 500 vizibil se repară;
//  o scurgere tăcută stă acolo luni de zile.
// ============================================================================

const ROOT_DOMAIN = (process.env.SITE_ROOT_DOMAIN || 'car-flip.com').toLowerCase();
const IS_PROD = process.env.NODE_ENV === 'production';
const DEBUG_HEADER = process.env.SITE_DEBUG_HEADER === 'true';

const resolveParc = async (req, res, next) => {
    // Marcaj folosit de blocul catch și de plasa de siguranță din server.js:
    // „hostname-ul ARATĂ ca un subdomeniu de-al nostru".
    req.isOurSubdomain = false;

    try {
        // ── Portiță de dezvoltare ───────────────────────────────────────────
        // Permite testarea pe localhost, înainte ca DNS-ul să propage:
        //     http://localhost:4000/?__parc=demo
        // Activă STRICT în afara producției.
        if (!IS_PROD && req.query.__parc) {
            const parc = await getParcBySubdomain(String(req.query.__parc));
            if (!parc) return renderSiteNotFound(res);
            req.parc = parc;
            req.isSite = true;
            req.isOurSubdomain = true;
            return next();
        }

        const host = String(req.hostname || '').toLowerCase().trim();
        if (!host) return next();

        // Domeniul principal — aplicația existentă. Nu atingem nimic.
        if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`) return next();

        // Nu e sub domeniul nostru: IP direct, localhost, health check-uri
        // interne, sau (mai târziu) un domeniu propriu de dealer.
        // TODO: aici intră lookup-ul pe `custom_domain`.
        if (!host.endsWith(`.${ROOT_DOMAIN}`)) return next();

        const subdomain = host.slice(0, -(ROOT_DOMAIN.length + 1));

        // Al doilea nivel (a.b.car-flip.com) nu e acoperit de certificatul
        // Universal gratuit de la Cloudflare, deci nici nu-l servim.
        if (!subdomain || subdomain.includes('.')) return renderSiteNotFound(res);

        req.isOurSubdomain = true;

        // ── Parcul se caută PRIMUL ──────────────────────────────────────────
        // Un site care există și e activ se servește întotdeauna, indiferent de
        // lista de rezervate. Vezi explicația din capul fișierului.
        const parc = await getParcBySubdomain(subdomain);

        if (parc && parc.active !== false) {
            req.parc = parc;
            req.isSite = true;
            if (DEBUG_HEADER) res.set('X-Parc', `${parc.subdomain}:ok`);
            return next();
        }

        // ── Fără parc: infrastructura trece, restul primește 404 ────────────
        if (isReservedSubdomain(subdomain)) {
            if (DEBUG_HEADER) res.set('X-Parc', `${subdomain}:rezervat`);
            return next();
        }

        // Inexistent SAU dezactivat → identic din exterior. Nu divulgăm
        // diferența: cine a avut un site și nu mai are nu trebuie să apară
        // public ca „suspendat".
        if (DEBUG_HEADER) res.set('X-Parc', `${subdomain}:${parc ? 'dezactivat' : 'inexistent'}`);
        return renderSiteNotFound(res);

    } catch (err) {
        console.error(`❌ [resolveParc] ${req.hostname}:`, err.message);

        // NU lăsăm request-ul să curgă spre site-ul principal dacă știm că e un
        // subdomeniu de-al nostru — ar afișa CarFlip pe domeniul dealerului.
        if (req.isOurSubdomain) return renderSiteError(res);
        return next();
    }
};

export default resolveParc;
