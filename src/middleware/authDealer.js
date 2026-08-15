import users from '../models/userModel.js';
import { parseCookies, readSession, COOKIE_NAME, destroySession, clearSessionCookie } from '../services/dealerSession.js';

// ============================================================================
//  src/middleware/authDealer.js
// ----------------------------------------------------------------------------
//  Autentificarea din panoul dealerului. Trei verificări, în ordinea asta:
//
//    1. sesiunea există în Redis
//    2. sesiunea aparține PARCULUI DIN HOSTNAME
//    3. utilizatorul mai există și nu e banat
//
//  ── DE CE PASUL 2 E ESENȚIAL ──────────────────────────────────────────────
//  Cookie-ul e setat pe `.car-flip.com`, deci browserul îl trimite către TOATE
//  subdomeniile. Fără verificarea asta, Bogdan se loghează pe
//  bogdan.car-flip.com/admin, scrie apoi autored.car-flip.com/admin în bara de
//  adrese, browserul trimite cookie-ul lui, iar serverul îl lasă înăuntru în
//  panoul altui dealer.
//
//  Verificarea stă AICI, nu în rute. Se aplică automat pe tot ce e sub /admin,
//  deci nu poate fi uitată la o rută nouă. Asta e diferența dintre „o linie de
//  cod" și un sistem: nu depinde de disciplina cuiva la fiecare adăugare.
//
//  ── APĂRAREA A DOUA ───────────────────────────────────────────────────────
//  Fiecare query din rute poartă `user_id` din sesiune, ca parte din FILTRU, nu
//  ca verificare ulterioară. Un anunț al altui dealer pur și simplu nu se
//  găsește — chiar dacă middleware-ul de mai sus ar fi ocolit cumva.
// ============================================================================

/**
 * Atașează `req.dealer` dacă sesiunea e validă. NU respinge — folosit pe
 * pagina de login, care trebuie să știe dacă utilizatorul e deja autentificat.
 */
export const loadDealer = async (req, res, next) => {
    req.dealer = null;
    try {
        if (!req.parc) return next();

        const sid = parseCookies(req)[COOKIE_NAME];
        if (!sid) return next();

        const session = await readSession(sid);
        if (!session) return next();

        // ── Izolarea pe tenant ──────────────────────────────────────────────
        // Sesiunea e legată de un parc anume. Pe alt subdomeniu, nu e validă.
        if (String(session.parcId) !== String(req.parc._id)) {
            return next();
        }

        const user = await users.findById(session.userId)
            .select('_id username email isBanned').lean();

        // Utilizator șters sau banat între autentificare și acum → sesiunea moare.
        if (!user || user.isBanned) {
            await destroySession(sid);
            clearSessionCookie(res);
            return next();
        }

        // Ultima verificare: contul chiar deține acest parc?
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

/** Cere autentificare. Paginile redirecționează, API-ul întoarce 401. */
export const requireDealer = (req, res, next) => {
    if (req.dealer) return next();

    if (req.path.startsWith('/admin/api/')) {
        return res.status(401).json({ success: false, message: 'Sesiune expirată. Autentifică-te din nou.' });
    }
    return res.redirect('/admin');
};

/**
 * Protecție CSRF pentru operațiile care modifică date.
 *
 * `SameSite=Lax` blochează deja cererile cross-site declanșate automat, dar
 * verificarea originii acoperă și cazurile de la margine. Cost: trei linii.
 */
export const checkOrigin = (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

    const origin = req.headers.origin || req.headers.referer;
    if (!origin) {
        // Fără Origin ȘI fără Referer: nu e un browser modern făcând o cerere
        // normală. Respingem, în loc să presupunem că e în regulă.
        return res.status(403).json({ success: false, message: 'Cerere respinsă.' });
    }

    // ⚠️ Comparație pe HOSTNAME PARSAT, niciodată cu startsWith.
    //
    // `origin.startsWith('https://' + req.hostname)` pare corect, dar e o breșă
    // clasică: `https://bogdan.car-flip.com.evil.com` începe exact așa și ar
    // trece verificarea. Un atacator își înregistrează un domeniu care începe
    // cu hostname-ul țintă și poate declanșa acțiuni în numele dealerului.
    //
    // `new URL()` extrage hostname-ul real; comparația exactă nu poate fi
    // păcălită nici cu sufixe, nici cu port, nici cu credențiale în URL.
    let originHost = null;
    try { originHost = new URL(origin).hostname.toLowerCase(); } catch { /* malformat */ }

    if (!originHost || originHost !== String(req.hostname || '').toLowerCase()) {
        console.warn(`[authDealer] Origine respinsă: ${origin} pentru ${req.hostname}`);
        return res.status(403).json({ success: false, message: 'Cerere respinsă (origine invalidă).' });
    }
    return next();
};

export default { loadDealer, requireDealer, checkOrigin };
