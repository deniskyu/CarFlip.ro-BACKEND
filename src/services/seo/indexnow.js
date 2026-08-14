import redisCache from '../../config/redisCache.js';

// ============================================================================
//  src/services/seo/indexnow.js
// ----------------------------------------------------------------------------
//  IndexNow: anunți motoarele de căutare că un URL s-a schimbat, printr-o
//  singură cerere HTTP. Gratuit, fără cont, fără chei API. Acceptat de Bing,
//  Yandex, Seznam și Naver; Google nu participă, dar nici nu strică.
//
//  Efortul e o funcție de 30 de linii. Câștigul: o mașină nouă poate fi
//  indexată în ore în loc de săptămâni.
//
//  ── CUM FUNCȚIONEAZĂ VERIFICAREA ──────────────────────────────────────────
//  Motorul verifică proprietatea cerând `https://<host>/<cheie>.txt`, care
//  trebuie să conțină exact cheia. Cum toate subdomeniile sunt servite de
//  același Express, ruta din siteSeoRoute.js răspunde pentru oricare host.
//
//  ── DEDUPLICARE ───────────────────────────────────────────────────────────
//  Un URL nu se anunță de două ori într-o oră. Fără asta, o editare repetată
//  (dealer care ajustează prețul de trei ori) ar trimite trei notificări
//  identice și ar putea atrage rate limiting.
// ============================================================================

const ENDPOINT = 'https://api.indexnow.org/indexnow';
const KEY = process.env.INDEXNOW_KEY || null;
const DEDUP_TTL = 3600;
const TIMEOUT_MS = 8000;

export const isIndexNowConfigured = () => !!KEY && /^[a-zA-Z0-9-]{8,128}$/.test(KEY);
export const getIndexNowKey = () => KEY;

/** Filtrează URL-urile deja anunțate recent. Dacă Redis e jos, le trimite pe toate. */
const filterRecent = async (urls) => {
    try {
        const out = [];
        for (const u of urls) {
            const set = await redisCache.set(`indexnow:${u}`, '1', 'EX', DEDUP_TTL, 'NX');
            if (set === 'OK') out.push(u);
        }
        return out;
    } catch {
        return urls;
    }
};

/**
 * Anunță unul sau mai multe URL-uri.
 * BEST-EFFORT: nu aruncă niciodată. SEO-ul nu are voie să rupă postarea unui anunț.
 *
 * @param {string} host   ex. "bogdan.car-flip.com"
 * @param {string[]} urls URL-uri absolute, de pe ACELAȘI host
 */
export const pingIndexNow = async (host, urls) => {
    if (!isIndexNowConfigured()) return { skipped: 'neconfigurat' };
    if (!host || !Array.isArray(urls) || urls.length === 0) return { skipped: 'fără URL-uri' };

    const valid = urls.filter((u) => typeof u === 'string' && u.startsWith(`https://${host}/`));
    if (valid.length === 0) return { skipped: 'URL-uri de pe alt host' };

    const fresh = await filterRecent(valid);
    if (fresh.length === 0) return { skipped: 'anunțate recent' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                host,
                key: KEY,
                keyLocation: `https://${host}/${KEY}.txt`,
                urlList: fresh.slice(0, 10000),
            }),
            signal: controller.signal,
        });
        if (res.ok || res.status === 202) {
            console.log(`🔔 [indexnow] ${host}: ${fresh.length} URL-uri anunțate.`);
            return { ok: true, count: fresh.length };
        }
        console.warn(`⚠️ [indexnow] ${host}: HTTP ${res.status}`);
        return { ok: false, status: res.status };
    } catch (err) {
        console.warn(`⚠️ [indexnow] ${host}:`, err.name === 'AbortError' ? 'timeout' : err.message);
        return { ok: false, error: err.message };
    } finally {
        clearTimeout(timer);
    }
};

export default { pingIndexNow, isIndexNowConfigured, getIndexNowKey };
