// ============================================================================
//  src/utils/slug.js
// ----------------------------------------------------------------------------
//  Generarea slug-urilor pentru URL-urile site-urilor de parcuri auto.
//
//  Slug-ul unui anunț arată așa:  bmw-seria-3-2018-a91c4d
//  ...adică:                      <marca>-<model>-<an>-<ultimele 6 hex din _id>
//
//  De ce sufixul din _id și nu un contor:
//   • e derivat determinist din document → aceeași intrare produce mereu
//     același slug, deci se poate regenera oricând fără să strice URL-uri;
//   • 16^6 ≈ 16,7 milioane de combinații, iar coliziunea ar cere DOUĂ anunțuri
//     cu exact aceeași marcă + model + an ȘI aceleași ultime 6 caractere hex
//     din ObjectId. Practic imposibil, dar indexul unic + backfill-ul
//     tratează oricum cazul (retry cu sufix mai lung).
//
//  ATENȚIE: slug-ul se generează O SINGURĂ DATĂ, la crearea anunțului, și nu
//  se mai schimbă niciodată. Rutele de editare existente nu permit modificarea
//  câmpurilor brand / model / production_year, deci slug-ul rămâne stabil.
//  Dacă vreodată se permite editarea lor, slug-ul TOT nu trebuie regenerat —
//  altfel se rup linkurile deja indexate de Google și cele date pe Facebook.
// ============================================================================

// Diacriticele românești, inclusiv variantele vechi cu sedilă (ş / ţ, U+015F /
// U+0163) care apar frecvent în date introduse de utilizatori. Plus câteva
// diacritice străine care apar în nume de mărci și modele (Citroën, Škoda).
const CHAR_MAP = {
    'ă': 'a', 'â': 'a', 'î': 'i', 'ș': 's', 'ț': 't', 'ş': 's', 'ţ': 't',
    'Ă': 'a', 'Â': 'a', 'Î': 'i', 'Ș': 's', 'Ț': 't', 'Ş': 's', 'Ţ': 't',
    'ä': 'a', 'à': 'a', 'á': 'a', 'å': 'a', 'æ': 'ae',
    'ë': 'e', 'é': 'e', 'è': 'e', 'ê': 'e',
    'ï': 'i', 'í': 'i', 'ì': 'i',
    'ö': 'o', 'ó': 'o', 'ò': 'o', 'ô': 'o', 'ø': 'o',
    'ü': 'u', 'ú': 'u', 'ù': 'u', 'û': 'u',
    'ç': 'c', 'č': 'c', 'ć': 'c',
    'ñ': 'n', 'ń': 'n',
    'š': 's', 'ž': 'z', 'ż': 'z', 'ź': 'z',
    'ß': 'ss', 'đ': 'd', 'ł': 'l', 'ý': 'y',
};

const CHAR_RE = new RegExp(`[${Object.keys(CHAR_MAP).join('')}]`, 'g');

/**
 * Transformă un text în slug sigur pentru URL.
 *   "Škoda Octavia 1.6 TDI"  →  "skoda-octavia-1-6-tdi"
 *   "Mercedes-Benz Clasa C"  →  "mercedes-benz-clasa-c"
 *
 * @param {string} text
 * @returns {string} slug fără diacritice, doar [a-z0-9-], fără cratime duble
 */
export const slugify = (text) => {
    if (text === null || text === undefined) return '';

    return String(text)
        // 1. Diacriticele cunoscute, prin hartă explicită (rapid și predictibil)
        .replace(CHAR_RE, (ch) => CHAR_MAP[ch] || ch)
        // 2. Plasă de siguranță pentru orice diacritic rămas: descompunem în
        //    caracter de bază + semn combinat, apoi ștergem semnele combinate.
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        // 3. Orice nu e literă latină sau cifră devine cratimă
        .replace(/[^a-z0-9]+/g, '-')
        // 4. Colapsăm cratimele multiple și le tăiem de la capete
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '');
};

const MAX_BASE_LENGTH = 60;
const MIN_SUFFIX = 4;
const MAX_SUFFIX = 24;

/**
 * Generează slug-ul complet al unui anunț.
 *
 * @param {object} sale  document (sau lean object) cu _id, brand.name,
 *                       model.name, production_year
 * @param {number} suffixLength  câte caractere din coada _id-ului se folosesc.
 *                       6 e valoarea normală; backfill-ul urcă la 10 / 16 doar
 *                       pentru documentele care au produs coliziune.
 * @returns {string}
 */
export const generateSaleSlug = (sale, suffixLength = 6) => {
    const brand = sale?.brand?.name || '';
    const model = sale?.model?.name || '';
    const year = sale?.production_year ? String(sale.production_year) : '';

    let base = slugify([brand, model, year].filter(Boolean).join(' '));

    // Date corupte sau incomplete → nu aruncăm, dăm o bază neutră.
    if (!base) base = 'auto';

    if (base.length > MAX_BASE_LENGTH) {
        base = base.slice(0, MAX_BASE_LENGTH).replace(/-+$/, '');
    }

    const len = Math.max(MIN_SUFFIX, Math.min(MAX_SUFFIX, Number(suffixLength) || MIN_SUFFIX));
    const id = String(sale?._id || '');

    // Fără _id (nu ar trebui să se întâmple) → sufix aleator, ca să nu întoarcem
    // un slug care s-ar ciocni garantat cu altul.
    const suffix = id.length >= len
        ? id.slice(-len)
        : (id || Math.random().toString(16).slice(2)).padStart(len, '0').slice(-len);

    return `${base}-${suffix}`;
};

/** Verifică dacă un string are forma unui slug valid (pentru params din rute). */
export const isValidSlug = (value) =>
    typeof value === 'string' &&
    value.length >= 3 &&
    value.length <= 100 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

/**
 * Extrage sufixul (partea derivată din _id) dintr-un slug.
 * Folositor ca fallback de lookup dacă vreodată se schimbă partea descriptivă.
 */
export const extractSlugSuffix = (slug) => {
    if (!isValidSlug(slug)) return null;
    const parts = slug.split('-');
    const last = parts[parts.length - 1];
    return /^[a-f0-9]{4,24}$/.test(last) ? last : null;
};

export default { slugify, generateSaleSlug, isValidSlug, extractSlugSuffix };
