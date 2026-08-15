import crypto from 'crypto';
import redisCache from '../config/redisCache.js';

// ============================================================================
//  src/services/dealerSession.js
// ----------------------------------------------------------------------------
//  Sesiunile pentru panoul dealerului. Complet separate de autentificarea
//  mobilă (Bearer token) și de cea a panoului tău de admin (ADMIN_JWT_SECRET).
//
//  ── DE CE REDIS ȘI NU JWT ─────────────────────────────────────────────────
//  Cu JWT nu poți invalida o sesiune: rămâne valabilă până expiră, oricât ai
//  vrea s-o oprești. Cu sesiuni în Redis, ștergi cheia și accesul dispare
//  instant — necesar când un client nu mai plătește, când o parolă e
//  compromisă, sau când dezactivezi un site.
//
//  Cookie-ul conține doar un identificator opac. Nicio informație despre
//  utilizator nu circulă prin browser.
//
//  ── DE CE `Path=/admin` ───────────────────────────────────────────────────
//  `Domain=.car-flip.com` e obligatoriu ca sesiunea să funcționeze pe
//  subdomenii, dar face ca browserul să trimită cookie-ul către TOATE
//  subdomeniile, inclusiv `api.car-flip.com`. Cu `Path=/admin`, nu pleacă spre
//  restul rutelor — mai puțină expunere, zero cost.
// ============================================================================

const PREFIX = 'dealer:sess:';
const TTL_SECONDS = 7 * 24 * 3600;
export const COOKIE_NAME = 'cf_dealer_sid';

const ROOT_DOMAIN = (process.env.SITE_ROOT_DOMAIN || 'car-flip.com').toLowerCase();
const IS_PROD = process.env.NODE_ENV === 'production';

const key = (sid) => `${PREFIX}${sid}`;

/**
 * Parsare manuală de cookie-uri — nu merită o dependență pentru zece linii.
 * Defensiv: un antet malformat întoarce un obiect gol, niciodată o excepție.
 */
export const parseCookies = (req) => {
    const raw = req.headers?.cookie;
    if (!raw || typeof raw !== 'string') return {};
    const out = {};
    for (const part of raw.split(';')) {
        const i = part.indexOf('=');
        if (i < 1) continue;
        const k = part.slice(0, i).trim();
        if (!k) continue;
        try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); }
        catch { out[k] = part.slice(i + 1).trim(); }
    }
    return out;
};

/**
 * Creează o sesiune și întoarce identificatorul.
 * 32 de octeți din generatorul criptografic → imposibil de ghicit.
 */
export const createSession = async (userId, parcId) => {
    const sid = crypto.randomBytes(32).toString('base64url');
    const payload = JSON.stringify({
        u: String(userId),
        p: String(parcId),
        at: Date.now(),
    });
    await redisCache.set(key(sid), payload, 'EX', TTL_SECONDS);
    return sid;
};

/**
 * Citește o sesiune și îi prelungește durata.
 *
 * Prelungirea la fiecare cerere înseamnă că un dealer care lucrează zilnic nu e
 * delogat niciodată, iar unul care nu intră o săptămână e delogat automat.
 */
export const readSession = async (sid) => {
    if (!sid || typeof sid !== 'string' || sid.length < 20 || sid.length > 200) return null;
    try {
        const raw = await redisCache.get(key(sid));
        if (!raw) return null;
        const s = JSON.parse(raw);
        redisCache.expire(key(sid), TTL_SECONDS).catch(() => {});
        return { userId: s.u, parcId: s.p, createdAt: s.at };
    } catch {
        return null;
    }
};

export const destroySession = async (sid) => {
    if (!sid) return;
    try { await redisCache.del(key(sid)); } catch { /* irelevant */ }
};

/** Stinge TOATE sesiunile unui parc. Folosit la dezactivarea unui site. */
export const destroyParcSessions = async (parcId) => {
    try {
        let cursor = '0';
        const target = String(parcId);
        do {
            const [next, keys] = await redisCache.scan(cursor, 'MATCH', `${PREFIX}*`, 'COUNT', 200);
            cursor = next;
            for (const k of keys) {
                const raw = await redisCache.get(k);
                if (raw && JSON.parse(raw).p === target) await redisCache.del(k);
            }
        } while (cursor !== '0');
    } catch (err) {
        console.warn('⚠️ [dealerSession] Nu am putut curăța sesiunile parcului:', err.message);
    }
};

const cookieBase = () => {
    const parts = [
        'HttpOnly',                    // JavaScript nu poate citi cookie-ul
        'SameSite=Lax',                // apărare de bază contra CSRF
        'Path=/admin',
        `Domain=.${ROOT_DOMAIN}`,
    ];
    if (IS_PROD) parts.push('Secure');  // pe HTTP local, `Secure` ar bloca cookie-ul
    return parts;
};

export const setSessionCookie = (res, sid) => {
    res.append('Set-Cookie',
        [`${COOKIE_NAME}=${sid}`, `Max-Age=${TTL_SECONDS}`, ...cookieBase()].join('; '));
};

export const clearSessionCookie = (res) => {
    res.append('Set-Cookie',
        [`${COOKIE_NAME}=`, 'Max-Age=0', ...cookieBase()].join('; '));
};

export default {
    COOKIE_NAME, parseCookies, createSession, readSession, destroySession,
    destroyParcSessions, setSessionCookie, clearSessionCookie,
};
