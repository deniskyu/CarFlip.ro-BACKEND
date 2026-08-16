import users from '../models/userModel.js';
import { parseCookies, readSession, COOKIE_NAME, destroySession, clearSessionCookie } from '../services/dealerSession.js';

// ============================================================================
//  src/middleware/authDealer.js   — checkOrigin CORECTAT
// ----------------------------------------------------------------------------
//  Autentificarea din panoul dealerului. Trei verificări, în ordinea asta:
//    1. sesiunea există în Redis
//    2. sesiunea aparține PARCULUI DIN HOSTNAME
//    3. utilizatorul mai există, nu e banat, și chiar deține acest parc
//
//  Verificarea 2 stă AICI, nu în rute: se aplică automat pe tot ce e sub
//  /admin, deci nu poate fi uitată la o rută nouă. Cookie-ul e setat pe
//  `.car-flip.com`, deci browserul îl trimite către TOATE subdomeniile — fără
//  verificarea asta, un dealer ar intra în panoul altuia scriind alt subdomeniu
//  în bara de adrese.
// ============================================================================

const ROOT_DOMAIN = (process.env.SITE_ROOT_DOMAIN || 'car-flip.com').toLowerCase();
const DEBUG = process.env.SITE_DEBUG_HEADER === 'true';

// Marker de versiune. Dacă în `pm2 logs` NU apare linia asta la pornire,
// rulează încă fișierul vechi — fie nu a fost copiat, fie nu s-a repornit.
console.log('🔐 [authDealer] v3 încărcat · checkOrigin tolerant la lipsa Origin/Referer');

export const loadDealer = async (req, res, next) => {
    req.dealer = null;
    try {
        if (!req.parc) return next();

        const sid = parseCookies(req)[COOKIE_NAME];
        if (!sid) return next();

        const session = await readSession(sid);
        if (!session) return next();

        // Sesiunea e legată de un parc anume. Pe alt subdomeniu, nu e validă.
        if (String(session.parcId) !== String(req.parc._id)) return next();

        const user = await users.findById(session.userId)
            .select('_id username email isBanned').lean();

        if (!user || user.isBanned) {
            await destroySession(sid);
            clearSessionCookie(res);
            return next();
        }

        if (String(req.parc.user_id) !== String(user._id)) {
            await destroySession(sid);
            clearSessionCookie(res);
            return next();
        }

        req.dealer = { sid, user, parc: req.parc };
        return next();

    } catch (err) {
        console.error('[authDealer] Eroare:', err.message);
        return next();
    }
};

export const requireDealer = (req, res, next) => {
    if (req.dealer) return next();
    if (req.path.startsWith('/admin/api/')) {
        return res.status(401).json({ success: false, message: 'Sesiune expirată. Autentifică-te din nou.' });
    }
    return res.redirect('/admin');
};

// ════════════════════════════════════════════════════════════════════════════
//  PROTECȚIE CSRF
// ════════════════════════════════════════════════════════════════════════════

/**
 * Extrage hostname-ul dintr-un Origin sau Referer.
 *
 * ⚠️ Comparația se face pe hostname PARSAT, niciodată cu `startsWith`.
 * `origin.startsWith('https://' + host)` pare corect, dar
 * `https://bogdan.car-flip.com.evil.com` începe exact așa și ar trece —
 * breșă clasică. `new URL()` nu poate fi păcălit nici cu sufixe, nici cu port,
 * nici cu credențiale în URL.
 */
const originHostOf = (value) => {
    try { return new URL(value).hostname.toLowerCase(); }
    catch { return null; }
};

/**
 * Lista gazdelor acceptate pentru cererea curentă.
 *
 * ── DE CE TREI SURSE, NU DOAR `req.hostname` ──────────────────────────────
 * `req.hostname` depinde de `trust proxy` și de anteturile pe care le pune
 * proxy-ul din față. Cu `trust proxy: 2`, Express citește `X-Forwarded-Host`
 * dacă există — iar unele configurații de nginx sau Cloudflare îl setează la
 * numele intern al serverului, nu la cel cerut de vizitator. Rezultatul: un
 * login perfect legitim era respins cu „origine invalidă".
 *
 * Sursa cea mai sigură e PARCUL DEJA REZOLVAT: dacă `resolveParc` a găsit
 * parcul, atunci `<subdomain>.<root>` e cu certitudine gazda corectă,
 * indiferent ce spun anteturile.
 */
const allowedHosts = (req) => {
    const set = new Set();

    if (req.parc?.subdomain) set.add(`${req.parc.subdomain}.${ROOT_DOMAIN}`);
    if (req.parc?.custom_domain) set.add(String(req.parc.custom_domain).toLowerCase());

    if (req.hostname) set.add(String(req.hostname).toLowerCase());

    // Header-ul Host brut, fără port — nu trece prin logica de `trust proxy`.
    const rawHost = String(req.headers.host || '').toLowerCase().split(':')[0];
    if (rawHost) set.add(rawHost);

    return set;
};

/**
 * Blochează cererile care modifică date și vin de pe alt site.
 *
 * `SameSite=Lax` acoperă deja majoritatea cazurilor; verificarea asta prinde
 * restul. Cost: o comparație într-un Set.
 */
export const checkOrigin = (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

    const raw = req.headers.origin || req.headers.referer;

    // ── Când browserul nu trimite NICIUN indiciu de origine ─────────────────
    // Se întâmplă real: Safari pe iOS omite `Origin` la formulare same-origin,
    // iar un `Referrer-Policy: no-referrer` (implicitul lui helmet) suprimă și
    // `Referer`. Respingerea ar bloca utilizatori legitimi.
    //
    // Nu rămânem descoperiți: cookie-ul de sesiune are `SameSite=Lax`, deci
    // browserul NU îl trimite la un POST venit de pe alt site. O cerere CSRF
    // ajunge aici fără sesiune, iar `requireDealer` o respinge oricum.
    //
    // Recomandat: `referrerPolicy: { policy: 'same-origin' }` în helmet, ca
    // Referer să existe și verificarea să fie efectivă. Vezi server.js.
    if (!raw) {
        console.warn(
            `[checkOrigin] Fără Origin/Referer pe ${req.method} ${req.originalUrl} — ` +
            `permis pe baza SameSite=Lax. Verifică referrerPolicy din helmet.`
        );
        return next();
    }

    const oHost = originHostOf(raw);
    const allowed = allowedHosts(req);

    if (oHost && allowed.has(oHost)) return next();

    // Diagnostic explicit: fără el, „origine invalidă" e o cutie neagră.
    console.warn(
        `[checkOrigin] RESPINS ${req.method} ${req.originalUrl}\n` +
        `   origin/referer : ${raw}\n` +
        `   hostname extras: ${oHost}\n` +
        `   gazde acceptate: ${[...allowed].join(', ') || '(niciuna)'}\n` +
        `   req.hostname=${req.hostname} · Host=${req.headers.host} · ` +
        `X-Forwarded-Host=${req.headers['x-forwarded-host'] || '—'}`
    );

    return res.status(403).json({
        success: false,
        message: 'Cerere respinsă (origine invalidă).',
        ...(DEBUG ? { debug: { origin: oHost, allowed: [...allowed] } } : {}),
    });
};

export default { loadDealer, requireDealer, checkOrigin };
