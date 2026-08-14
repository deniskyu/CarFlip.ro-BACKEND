import redisCache from '../config/redisCache.js';
import parcuri from '../models/parcModel.js';

// ============================================================================
//  src/services/parcCache.js
// ----------------------------------------------------------------------------
//  Cache-ul pentru documentele de parc. Se citește la FIECARE request către un
//  subdomeniu, deci fără el Mongo ar primi un query pentru fiecare imagine,
//  pagină și crawler care trece pe acolo.
//
//  Două lucruri mai puțin evidente, ambele importante:
//
//  1. NEGATIVE CACHING. Se cache-uiește și rezultatul „nu există acest parc".
//     Fără asta, un bot care scanează subdomenii (se întâmplă în câteva zile de
//     la punerea unui wildcard DNS) generează un query în Mongo pentru fiecare
//     `xyz123.car-flip.com` inventat. Cu el, al doilea request pentru același
//     subdomeniu inexistent nu mai atinge baza de date deloc.
//
//  2. DEGRADARE GRAȚIOASĂ. Dacă Redis e jos, funcția NU aruncă — merge direct
//     la Mongo. Site-urile devin mai lente, nu moarte. O pană de cache nu are
//     voie să fie o pană de producție.
// ============================================================================

const PREFIX = 'parc:sub:';
const TTL_HIT = 300;   // 5 minute — stocul se schimbă rar, invalidăm explicit la scriere
const TTL_MISS = 60;   // 1 minut — mai scurt, ca un parc nou să apară repede
const MISS = '__none__';

const key = (sub) => `${PREFIX}${sub}`;

/**
 * Găsește un parc după subdomeniu, cu cache.
 *
 * @param {string} subdomain
 * @returns {Promise<object|null>} obiect public (fără `notes`) sau null
 */
export const getParcBySubdomain = async (subdomain) => {
    if (typeof subdomain !== 'string' || !subdomain.trim()) return null;
    const sub = subdomain.trim().toLowerCase();

    // ── 1. Cache ────────────────────────────────────────────────────────────
    try {
        const cached = await redisCache.get(key(sub));
        if (cached === MISS) return null;
        if (cached) return JSON.parse(cached);
    } catch (err) {
        // Redis jos sau valoare coruptă → mergem la Mongo. Nu e o eroare fatală.
    }

    // ── 2. Mongo ────────────────────────────────────────────────────────────
    let parc = null;
    try {
        parc = await parcuri.findOne({ subdomain: sub }).lean();
    } catch (err) {
        console.error(`❌ [parcCache] Eroare Mongo pentru "${sub}":`, err.message);
        return null;
    }

    const publicParc = parc ? parcuri.toPublic(parc) : null;

    // ── 3. Populăm cache-ul ─────────────────────────────────────────────────
    try {
        if (publicParc) {
            await redisCache.set(key(sub), JSON.stringify(publicParc), 'EX', TTL_HIT);
        } else {
            await redisCache.set(key(sub), MISS, 'EX', TTL_MISS);
        }
    } catch (err) {
        // Nu putem scrie în cache → nu contează, răspunsul e deja corect.
    }

    return publicParc;
};

/**
 * Șterge din cache unul sau mai multe subdomenii.
 *
 * ⚠️ La REDENUMIREA unui subdomeniu trebuie invalidate AMÂNDOUĂ:
 *      await invalidateParcCache(subdomeniuVechi, subdomeniuNou);
 *    Altfel vechiul subdomeniu continuă să servească site-ul încă 5 minute
 *    după ce a fost eliberat, iar cel nou nu răspunde până expiră miss-ul.
 */
export const invalidateParcCache = async (...subdomains) => {
    const keys = subdomains
        .filter((s) => typeof s === 'string' && s.trim())
        .map((s) => key(s.trim().toLowerCase()));

    if (keys.length === 0) return;

    try {
        await redisCache.del(...keys);
    } catch (err) {
        console.warn('⚠️ [parcCache] Nu am putut invalida cache-ul:', err.message);
        // Cel mai rău caz: modificarea se vede după TTL_HIT (5 minute).
    }
};

/**
 * Scrie direct un parc în cache, fără să mai lovim Mongo.
 * Se apelează după o salvare din panoul de admin, imediat după invalidare, ca
 * primul vizitator de după modificare să nu prindă un cache rece.
 */
export const warmParcCache = async (parcDoc) => {
    if (!parcDoc?.subdomain) return;
    const publicParc = typeof parcDoc.toPublicJSON === 'function'
        ? parcDoc.toPublicJSON()
        : parcuri.toPublic(parcDoc);
    try {
        await redisCache.set(key(parcDoc.subdomain), JSON.stringify(publicParc), 'EX', TTL_HIT);
    } catch (err) { /* irelevant */ }
};

export default { getParcBySubdomain, invalidateParcCache, warmParcCache };
