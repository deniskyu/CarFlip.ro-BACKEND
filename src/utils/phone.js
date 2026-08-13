// ============================================================================
//  src/utils/phone.js
// ----------------------------------------------------------------------------
//  Normalizarea numerelor de telefon pentru linkurile wa.me și tel:.
//
//  De ce e nevoie de asta: wa.me acceptă DOAR formatul internațional, fără
//  plus și fără spații — https://wa.me/40761930497. Dacă dealerul (sau tu, în
//  formular) scrie "0761 930 497", linkul iese https://wa.me/0761930497 și
//  pur și simplu NU FUNCȚIONEAZĂ — se deschide WhatsApp cu eroare de număr
//  invalid, iar butonul principal de conversie al site-ului e mort.
//
//  E cea mai ieftină greșeală de prevenit din tot proiectul, de aceea
//  normalizarea se face în setter-ul modelului, nu în rută: indiferent pe unde
//  intră datele, în DB ajunge formatul corect.
// ============================================================================

const RO_PREFIX = '40';

/**
 * Normalizează un număr românesc în format internațional fără plus.
 *   "0761 930 497"     → "40761930497"
 *   "+40 761 930 497"  → "40761930497"
 *   "0040761930497"    → "40761930497"
 *   "761930497"        → "40761930497"
 *   "40761930497"      → "40761930497"
 *
 * Numerele care par deja internaționale non-RO (ex. "49...") sunt lăsate așa
 * cum sunt — nu presupunem că orice client e din România.
 *
 * @param {string} raw
 * @returns {string} doar cifre, sau '' dacă intrarea e inutilizabilă
 */
export const normalizePhone = (raw) => {
    if (raw === null || raw === undefined) return '';

    let digits = String(raw).replace(/\D/g, '');
    if (!digits) return '';

    // 00 40 ... → 40 ...
    if (digits.startsWith('00')) digits = digits.slice(2);

    // 0761930497 (10 cifre, format național RO) → 40761930497
    if (digits.length === 10 && digits.startsWith('0')) {
        return RO_PREFIX + digits.slice(1);
    }

    // 761930497 (9 cifre, fără zero, cum tastează unii) → 40761930497
    if (digits.length === 9 && digits.startsWith('7')) {
        return RO_PREFIX + digits;
    }

    return digits;
};

/** Validare permisivă: orice număr internațional plauzibil. */
export const isValidPhone = (value) => {
    const d = normalizePhone(value);
    return d.length >= 10 && d.length <= 15;
};

/**
 * Formatare pentru AFIȘARE pe site: "0761 930 497".
 * Numerele non-RO sunt afișate cu plus, grupate în blocuri de 3.
 */
export const formatPhoneDisplay = (raw) => {
    const d = normalizePhone(raw);
    if (!d) return '';

    if (d.startsWith(RO_PREFIX) && d.length === 11) {
        const national = '0' + d.slice(2);            // 0761930497
        return `${national.slice(0, 4)} ${national.slice(4, 7)} ${national.slice(7)}`;
    }
    return '+' + d.replace(/(\d{2,3})(?=\d)/g, '$1 ').trim();
};

/** Linkul brut pentru atributul href="tel:..." */
export const toTelHref = (raw) => {
    const d = normalizePhone(raw);
    return d ? `tel:+${d}` : '';
};

export default { normalizePhone, isValidPhone, formatPhoneDisplay, toTelHref };
