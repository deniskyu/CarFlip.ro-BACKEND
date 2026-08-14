// ============================================================================
//  src/site/html.js
// ----------------------------------------------------------------------------
//  Fundația sistemului de componente. ~60 de linii care fac diferența dintre
//  „template literals" și un motor de randare adevărat.
//
//  ── DE CE CONTEAZĂ ESCAPAREA AUTOMATĂ ─────────────────────────────────────
//  În HTML-ul site-ului intră text scris de dealer: titluri de anunțuri,
//  descrieri, nume de servicii, textul „Despre noi". Conținut necontrolat.
//  O descriere care conține `<img src=x onerror=alert(1)>` ar executa cod în
//  browserul fiecărui vizitator.
//
//  Cu template literals simple, ar trebui să-ți amintești `escapeHtml()` la
//  FIECARE interpolare. Ai reușit de 200 de ori și ai uitat o dată → ai o
//  vulnerabilitate. Aici e invers: escaparea e implicită, iar HTML-ul brut
//  cere un gest explicit (`raw()`).
//
//  ── CUM SE COMPORTĂ VALORILE ──────────────────────────────────────────────
//    string / number   → escapate
//    null / undefined  → șir gol (nu „null" în pagină)
//    false             → șir gol  → permite `${cond && html`...`}`
//    true              → șir gol
//    array             → fiecare element procesat, concatenate
//    rezultat de html``→ inserat ca atare (deja procesat)
//    raw(x)            → inserat neescapat, pe răspunderea apelantului
// ============================================================================

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESCAPE_RE = /[&<>"']/g;

export const escapeHtml = (value) =>
    String(value).replace(ESCAPE_RE, (c) => ESCAPES[c]);

const RAW = Symbol('raw-html');

/**
 * Marchează un șir ca HTML gata escapat.
 * Se folosește DOAR pentru conținut generat de noi (SVG-uri din registru,
 * JSON-LD deja serializat). Niciodată pe date venite de la dealer.
 */
export const raw = (str) => ({ [RAW]: true, value: String(str ?? '') });

export const isRaw = (v) => !!(v && typeof v === 'object' && v[RAW]);

const render = (value) => {
    if (value === null || value === undefined || value === false || value === true) return '';
    if (isRaw(value)) return value.value;
    if (Array.isArray(value)) return value.map(render).join('');
    return escapeHtml(value);
};

/** Template tag principal. Întoarce un obiect raw, deci se poate compune. */
export const html = (strings, ...values) => {
    let out = strings[0];
    for (let i = 0; i < values.length; i++) {
        out += render(values[i]) + strings[i + 1];
    }
    return raw(out);
};

/** Convertește rezultatul final în șirul trimis către browser. */
export const toString = (node) => render(node);

// ─── Ajutoare ───────────────────────────────────────────────────────────────

/**
 * Atribute condiționale: `attrs({ class: x, 'data-y': cond && 'z' })`
 * Valorile false/null/undefined dispar; `true` produce atribut fără valoare.
 */
export const attrs = (obj) => {
    const parts = [];
    for (const [k, v] of Object.entries(obj || {})) {
        if (v === false || v === null || v === undefined || v === '') continue;
        if (v === true) { parts.push(escapeHtml(k)); continue; }
        parts.push(`${escapeHtml(k)}="${escapeHtml(v)}"`);
    }
    return raw(parts.join(' '));
};

/** Nume de clase condiționale: `cls('card', big && 'card--big')` */
export const cls = (...names) => names.filter(Boolean).join(' ');

/**
 * Conținut de <style> sau <script>.
 * Escaparea normală ar strica CSS-ul (`>` din selectori devine `&gt;`), dar
 * un `</style>` din conținut ar închide tag-ul devreme. Neutralizăm exact
 * secvența periculoasă și lăsăm restul intact.
 */
export const styleContent = (css) =>
    raw(String(css ?? '').replace(/<\/(style|script)/gi, '<\\/$1'));

export default { html, raw, escapeHtml, toString, attrs, cls, styleContent };
