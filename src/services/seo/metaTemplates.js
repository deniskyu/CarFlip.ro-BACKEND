// ============================================================================
//  src/services/seo/metaTemplates.js
// ----------------------------------------------------------------------------
//  Generarea titlurilor, descrierilor și a textelor auto-completate.
//
//  ── PROBLEMA REZOLVATĂ AICI ───────────────────────────────────────────────
//  Un singur codebase care servește 30 de site-uri ar produce 30 de descrieri
//  identice cuvânt cu cuvânt. Google le vede ca șabloane și le devalorizează
//  pe toate, inclusiv pe cele ale clienților buni.
//
//  Soluția: mai multe variante de șablon per tip de pagină, alese DETERMINIST
//  din subdomeniu, cu exact tehnica din `captions.js` (suma codurilor de
//  caractere modulo numărul de variante). Fiecare parc primește mereu aceeași
//  variantă — deci textul nu se schimbă la fiecare deploy și nu derutează
//  crawlerul — dar doi parcuri diferiți primesc formulări diferite.
//
//  ── DE CE NU META KEYWORDS ────────────────────────────────────────────────
//  Tag-ul `<meta name="keywords">` e ignorat de Google din 2009. Nu se
//  generează. `seo_keywords` din formular alimentează în schimb conținut real:
//  descrieri, intro-uri de pagini de marcă, textul „Despre noi" auto-generat.
// ============================================================================

const MAX_DESC = 158; // sub 160, ca Google să nu taie la mijloc de cuvânt

/** Selecție deterministă — identică cu pickIndex din services/socialPromo/captions.js */
export const pickIndex = (seed, len) => {
    const s = String(seed || '');
    let sum = 0;
    for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
    return len > 0 ? sum % len : 0;
};

const fmtPrice = (n) =>
    Number.isFinite(Number(n)) ? `${new Intl.NumberFormat('de-DE').format(Number(n))} €` : '';
const fmtNum = (n) =>
    Number.isFinite(Number(n)) ? new Intl.NumberFormat('de-DE').format(Number(n)) : '';

const clip = (s, max = MAX_DESC) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max - 1);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[ ,.;–-]+$/, '') + '…';
};

/** Prima frază-cheie a parcului, sau o formulare neutră dacă nu are niciuna. */
const kw = (parc, i = 0) => {
    const list = Array.isArray(parc?.seo_keywords) ? parc.seo_keywords.filter(Boolean) : [];
    return list.length ? list[i % list.length] : `mașini second hand ${parc?.city || ''}`.trim();
};

// ════════════════════════════════════════════════════════════════════════════
//  TITLURI
// ════════════════════════════════════════════════════════════════════════════

const TITLE = {
    home: [
        (p) => `${p.display_name} — Mașini second hand în ${p.city} | Parc auto ${p.county}`,
        (p) => `${p.display_name} | Parc auto în ${p.city} — autoturisme rulate verificate`,
        (p) => `Mașini rulate în ${p.city} — ${p.display_name}, parc auto ${p.county}`,
        (p) => `${p.display_name} ${p.city} — vânzări auto second hand în ${p.county}`,
    ],
    stoc: [
        (p, d) => `Mașini de vânzare în ${p.city} — ${d.total} autovehicule în stoc | ${p.display_name}`,
        (p, d) => `Stoc auto ${p.display_name} — ${d.total} mașini disponibile în ${p.city}`,
        (p, d) => `${d.total} mașini second hand în ${p.city} | ${p.display_name}`,
    ],
    car: [
        (p, d) => `${d.name} ${d.year} · ${d.price} — ${p.display_name} ${p.city}`,
        (p, d) => `${d.name} ${d.year}, ${d.km} km — ${d.price} | ${p.display_name}`,
        (p, d) => `${d.name} din ${d.year} de vânzare în ${p.city} — ${d.price}`,
    ],
    brand: [
        (p, d) => `${d.brand} second hand în ${p.city} — ${d.count} mașini | ${p.display_name}`,
        (p, d) => `${d.count} mașini ${d.brand} de vânzare în ${p.city} | ${p.display_name}`,
        (p, d) => `${d.brand} rulate ${p.city} — stoc ${p.display_name}`,
    ],
    model: [
        (p, d) => `${d.brand} ${d.model} de vânzare în ${p.city} — ${d.count} anunțuri | ${p.display_name}`,
        (p, d) => `${d.brand} ${d.model} second hand ${p.city} | ${p.display_name}`,
    ],
    contact: [
        (p) => `Contact și program — ${p.display_name}, ${p.city}`,
        (p) => `${p.display_name} — unde ne găsești în ${p.city}`,
    ],
};

// ════════════════════════════════════════════════════════════════════════════
//  DESCRIERI
// ════════════════════════════════════════════════════════════════════════════

const DESC = {
    home: [
        (p, d) => `${p.display_name} din ${p.city}: ${d.total} autoturisme rulate în stoc, verificate înainte de vânzare. ${kw(p, 1)}. Sună sau scrie-ne pe WhatsApp.`,
        (p, d) => `Caută printre ${d.total} mașini second hand disponibile în ${p.city}, județul ${p.county}. ${kw(p, 0)} la ${p.display_name}.`,
        (p, d) => `Parc auto în ${p.city} cu ${d.total} mașini în stoc${d.priceFrom ? `, de la ${d.priceFrom}` : ''}. Vino la o vizionare sau întreabă-ne pe WhatsApp.`,
        (p, d) => `${d.total} autovehicule disponibile la ${p.display_name}, ${p.city}. ${kw(p, 2)}. Program și locație pe pagina de contact.`,
    ],
    stoc: [
        (p, d) => `Toate cele ${d.total} mașini din stocul ${p.display_name}, ${p.city}. Filtrează după marcă, preț, an sau kilometraj${d.brands ? `. Disponibile: ${d.brands}` : ''}.`,
        (p, d) => `Stoc complet: ${d.total} autoturisme rulate în ${p.city}${d.priceRange ? `, ${d.priceRange}` : ''}. Filtre după marcă, an și kilometraj.`,
        (p, d) => `${d.total} mașini second hand de vânzare în ${p.city}${d.brands ? `: ${d.brands}` : ''}. Vezi prețuri, kilometraj și fotografii.`,
    ],
    car: [
        (p, d) => `${d.name} din ${d.year}, ${d.km} km, ${d.fuel}${d.hp ? `, ${d.hp}` : ''}. Preț ${d.price}${d.negotiable ? ', negociabil' : ''}. Disponibil la ${p.display_name}, ${p.city}.`,
        (p, d) => `De vânzare: ${d.name} ${d.year}, ${d.fuel}, ${d.km} km, ${d.transmission}. ${d.price} la ${p.display_name} din ${p.city}. Scrie-ne pe WhatsApp.`,
        (p, d) => `${d.name} ${d.year} la ${d.price}. ${d.km} km, ${d.fuel}${d.body ? `, ${d.body}` : ''}. Vizionare în ${p.city}, la ${p.display_name}.`,
    ],
    brand: [
        (p, d) => `${d.count} mașini ${d.brand} second hand în stocul ${p.display_name} din ${p.city}${d.priceRange ? `, ${d.priceRange}` : ''}${d.years ? `, fabricație ${d.years}` : ''}.`,
        (p, d) => `Vezi toate cele ${d.count} autoturisme ${d.brand} disponibile în ${p.city}${d.models ? `. Modele: ${d.models}` : ''}.`,
        (p, d) => `${d.brand} rulate de vânzare la ${p.display_name}, ${p.city}: ${d.count} mașini${d.priceRange ? `, ${d.priceRange}` : ''}.`,
    ],
    model: [
        (p, d) => `${d.count} ${d.brand} ${d.model} de vânzare în ${p.city}${d.priceRange ? `, ${d.priceRange}` : ''}. Fotografii, kilometraj și dotări la ${p.display_name}.`,
        (p, d) => `${d.brand} ${d.model} second hand la ${p.display_name} din ${p.city}: ${d.count} anunțuri disponibile${d.years ? `, ${d.years}` : ''}.`,
    ],
    contact: [
        (p) => `${p.display_name} — ${p.address}, ${p.city}, ${p.county}. Program, hartă și contact rapid pe WhatsApp.`,
        (p) => `Ne găsești în ${p.address}, ${p.city}. Vezi programul complet și scrie-ne direct pe WhatsApp.`,
    ],
};

/**
 * Construiește title + description pentru o pagină.
 *
 * @param {'home'|'stoc'|'car'|'brand'|'model'|'contact'} page
 * @param {object} parc
 * @param {object} data  câmpurile cerute de șabloane (vezi mai jos)
 */
export const buildMeta = (page, parc, data = {}) => {
    const p = parc || {};
    const titles = TITLE[page] || TITLE.home;
    const descs = DESC[page] || DESC.home;

    // Seed diferit per tip de pagină, altfel toate paginile unui site ar folosi
    // exact aceeași poziție din fiecare listă și s-ar simți repetitiv.
    const seed = `${p.subdomain || ''}:${page}`;

    let title = '';
    let description = '';
    try {
        title = titles[pickIndex(seed, titles.length)](p, data);
        description = descs[pickIndex(seed + 'd', descs.length)](p, data);
    } catch {
        title = `${p.display_name || 'Parc auto'} — ${p.city || ''}`.trim();
        description = `Mașini second hand la ${p.display_name || 'parcul nostru'}.`;
    }

    // Override manual pe home, dacă a fost completat în formular.
    if (page === 'home' && p.meta_description) description = p.meta_description;

    return { title: clip(title, 65), description: clip(description) };
};

// ════════════════════════════════════════════════════════════════════════════
//  DATE PENTRU ȘABLOANE — pregătite din documente brute
// ════════════════════════════════════════════════════════════════════════════

export const carMetaData = (sale) => ({
    name: [sale.brand?.name, sale.model?.name].filter(Boolean).join(' '),
    year: sale.production_year,
    price: fmtPrice(sale.price),
    km: fmtNum(sale.mileage),
    fuel: sale.engine?.fuel_type || '',
    hp: sale.horsepower ? `${sale.horsepower} CP` : '',
    transmission: sale.transmission || '',
    body: sale.body_type || '',
    negotiable: !!sale.negotiable,
});

export const stockMetaData = (filters) => ({
    total: filters?.total || 0,
    brands: (filters?.brands || []).slice(0, 5).map((b) => b.name).join(', '),
    priceFrom: filters?.price?.min ? fmtPrice(filters.price.min) : '',
    priceRange: filters?.price?.max
        ? `de la ${fmtPrice(filters.price.min)} la ${fmtPrice(filters.price.max)}`
        : '',
});

export const brandMetaData = (brand) => ({
    brand: brand?.name || '',
    count: brand?.count || 0,
    models: (brand?.models || []).slice(0, 4).map((m) => m.name).join(', '),
    priceRange: brand?.maxPrice ? `de la ${fmtPrice(brand.minPrice)}` : '',
    years: brand?.minYear && brand?.maxYear
        ? (brand.minYear === brand.maxYear ? `${brand.minYear}` : `${brand.minYear}–${brand.maxYear}`)
        : '',
});

// ════════════════════════════════════════════════════════════════════════════
//  TEXTE GENERATE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Textul „Despre noi" când dealerul nu îl completează.
 *
 * Nu e umplutură: e compus din date reale (an înființare, oraș, stoc, mărci,
 * localități deservite, servicii) și devine conținut indexabil. Un dealer
 * care nu scrie nimic ar avea altfel o pagină goală, ceea ce blochează
 * `indexable` și oprește tot SEO-ul.
 */
export const generateAboutText = (parc, filters) => {
    const p = parc || {};
    if (p.about_text) return p.about_text;

    const parts = [];
    const years = p.founded_year ? new Date().getFullYear() - p.founded_year : null;

    parts.push(
        years && years > 0
            ? `${p.display_name} activează din ${p.founded_year} în ${p.city}, județul ${p.county}, cu peste ${years} ani de experiență în vânzarea de autoturisme rulate.`
            : `${p.display_name} este un parc auto din ${p.city}, județul ${p.county}, specializat în vânzarea de autoturisme rulate.`
    );

    const total = filters?.total || 0;
    const brands = (filters?.brands || []).slice(0, 4).map((b) => b.name);
    if (total > 0) {
        parts.push(
            brands.length
                ? `În stoc avem ${total} ${total === 1 ? 'mașină' : 'mașini'}, printre care ${brands.join(', ')}.`
                : `În stoc avem ${total} ${total === 1 ? 'mașină disponibilă' : 'mașini disponibile'}.`
        );
    }

    const services = (p.services || []).map((s) => s.title).filter(Boolean);
    if (services.length) parts.push(`Oferim ${services.join(', ').toLowerCase()}.`);

    const area = (p.seo_service_area || []).filter((a) => a && a !== p.city);
    if (area.length) parts.push(`Lucrăm cu clienți din ${p.city} și din împrejurimi: ${area.slice(0, 6).join(', ')}.`);

    parts.push(`Te așteptăm la o vizionare sau scrie-ne direct pe WhatsApp pentru detalii.`);

    return parts.join(' ');
};

/** Text alternativ pentru imagini. Niciodată gol. */
export const buildAltText = (sale, parc, index = 0) => {
    const name = [sale?.brand?.name, sale?.model?.name].filter(Boolean).join(' ') || 'Autoturism';
    const year = sale?.production_year ? ` ${sale.production_year}` : '';
    const at = parc?.display_name ? ` la ${parc.display_name}` : '';
    const city = parc?.city ? `, ${parc.city}` : '';
    const n = index > 0 ? ` — fotografia ${index + 1}` : '';
    return `${name}${year} de vânzare${at}${city}${n}`;
};

/**
 * Linkul WhatsApp cu CONTEXT.
 *
 * Fără marca, modelul și linkul în mesaj, dealerul primește zeci de „bună ziua"
 * fără să știe despre ce mașină e vorba, iar butonul devine inutil. Numărul vine
 * întotdeauna din `parcModel`, NU din `sale.phone_number` — anunțurile vechi din
 * aplicație pot avea alt număr.
 */
export const buildWhatsappLink = (parc, sale, absoluteUrl) => {
    const num = String(parc?.whatsapp || '').replace(/\D/g, '');
    if (!num) return '';
    if (!sale) {
        return `https://wa.me/${num}?text=${encodeURIComponent(
            `Bună ziua! Sunt interesat de mașinile de la ${parc.display_name}.`
        )}`;
    }
    const name = [sale.brand?.name, sale.model?.name, sale.production_year].filter(Boolean).join(' ');
    const msg = `Bună ziua! Sunt interesat de ${name}${absoluteUrl ? ` — ${absoluteUrl}` : ''}`;
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
};

/** Intro generat pentru paginile de marcă — conținut real din stoc, nu umplutură. */
export const buildBrandIntro = (parc, brand) => {
    const p = parc || {};
    const price = brand?.minPrice
        ? (brand.minPrice === brand.maxPrice
            ? ` la ${fmtPrice(brand.minPrice)}`
            : ` cu prețuri între ${fmtPrice(brand.minPrice)} și ${fmtPrice(brand.maxPrice)}`)
        : '';
    const years = brand?.minYear
        ? (brand.minYear === brand.maxYear ? ` din ${brand.minYear}` : `, fabricate între ${brand.minYear} și ${brand.maxYear}`)
        : '';
    const models = (brand?.models || []).slice(0, 5).map((m) => m.name);

    const out = [
        `${p.display_name} are în stoc ${brand.count} ${brand.count === 1 ? 'mașină' : 'mașini'} ${brand.name}${price}${years}.`,
    ];
    if (models.length > 1) out.push(`Modele disponibile: ${models.join(', ')}.`);
    out.push(`Toate pot fi vizionate în ${p.city}, județul ${p.county}. Pentru detalii sau programare, scrie-ne pe WhatsApp.`);
    return out.join(' ');
};

export default {
    pickIndex, buildMeta, carMetaData, stockMetaData, brandMetaData,
    generateAboutText, buildAltText, buildWhatsappLink, buildBrandIntro,
};
