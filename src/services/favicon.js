import sharp from 'sharp';
import redisCache from '../config/redisCache.js';

// ============================================================================
//  src/services/favicon.js
// ----------------------------------------------------------------------------
//  Generează un favicon ROTUNJIT din logo-ul parcului.
//
//  ── DE CE E NEVOIE DE COD PENTRU ASTA ─────────────────────────────────────
//  Browserul desenează fișierul de favicon exact cum e. Logo-ul e stocat ca
//  JPEG pătrat (JPEG nu are canal alfa), deci în tab apare un pătrat, oricât
//  CSS am scrie — CSS-ul nu ajunge la bara de tab-uri.
//
//  Singura soluție reală e un PNG cu colțuri transparente. Îl generăm o dată
//  și îl ținem în Redis 24 de ore.
//
//  ── DE CE NU UN SVG CU MASCĂ ──────────────────────────────────────────────
//  Un favicon SVG care referă imaginea de pe R2 printr-un `<image href>` e
//  blocat de majoritatea browserelor: resursele externe din favicon-uri SVG
//  sunt considerate risc de urmărire. Ar fi mers pe Chrome și ar fi picat pe
//  Safari — exact genul de lucru care se descoperă la client.
//
//  ── DEGRADARE ─────────────────────────────────────────────────────────────
//  Orice eșec (R2 indisponibil, imagine coruptă, sharp) întoarce `null`, iar
//  ruta cade înapoi pe logo-ul brut. Un favicon pătrat e o problemă cosmetică;
//  o pagină care nu se încarcă nu e.
// ============================================================================

const SIZE = 64;
const TTL = 24 * 3600;
const FETCH_TIMEOUT = 6000;

const key = (parcId) => `parc:favicon:${parcId}`;

/**
 * Masca circulară, ca SVG. Compusă peste imagine cu `dest-in`, păstrează doar
 * pixelii din interiorul cercului și face restul transparent.
 */
const CIRCLE_MASK = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="#fff"/></svg>`
);

/**
 * @returns {Promise<Buffer|null>} PNG 64×64 cu colțuri transparente
 */
export const buildFavicon = async (parc) => {
    if (!parc?.logo_url) return null;

    // 1. Cache
    try {
        const hit = await redisCache.getBuffer(key(parc._id));
        if (hit && hit.length > 0) return hit;
    } catch { /* Redis jos → generăm */ }

    // 2. Descărcăm logo-ul
    let input;
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
        try {
            const res = await fetch(parc.logo_url, { signal: ctrl.signal });
            if (!res.ok) return null;
            input = Buffer.from(await res.arrayBuffer());
        } finally {
            clearTimeout(timer);
        }
    } catch (err) {
        console.warn(`⚠️ [favicon] ${parc.subdomain}: nu am putut descărca logo-ul —`, err.message);
        return null;
    }

    // 3. Rotunjim
    try {
        const png = await sharp(input)
            // `contain` pe alb: logo-urile late nu se taie, exact ca la upload.
            .resize(SIZE, SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
            .composite([{ input: CIRCLE_MASK, blend: 'dest-in' }])
            .png({ compressionLevel: 9 })
            .toBuffer();

        try { await redisCache.set(key(parc._id), png, 'EX', TTL); } catch { /* irelevant */ }
        return png;
    } catch (err) {
        console.warn(`⚠️ [favicon] ${parc.subdomain}: sharp —`, err.message);
        return null;
    }
};

/** Se apelează la schimbarea logo-ului, ca să nu rămână cel vechi 24 de ore. */
export const invalidateFavicon = async (parcId) => {
    try { await redisCache.del(key(parcId)); } catch { /* irelevant */ }
};

export default { buildFavicon, invalidateFavicon };
