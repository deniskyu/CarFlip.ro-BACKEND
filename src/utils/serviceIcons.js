// ============================================================================
//  src/utils/serviceIcons.js
// ----------------------------------------------------------------------------
//  Setul de iconițe folosit în secțiunea „Servicii" de pe pagina de acasă.
//
//  ── DE CE SVG INLINE, NU O LIBRĂRIE ───────────────────────────────────────
//  1. CSP. Politica noastră e `defaultSrc: 'self'`. Un CDN de iconițe (sau un
//     font de iconițe extern) ar fi pur și simplu blocat de browser.
//  2. Performanță. Zero cereri HTTP suplimentare, zero blocare la randare,
//     zero layout shift. Iconițele fac parte din HTML-ul deja livrat.
//  3. Culoare automată. `stroke="currentColor"` face ca fiecare iconiță să
//     preia culoarea de accent a presetării, fără nicio configurare.
//  4. Zero dependențe de întreținut.
//
//  ── STIL ──────────────────────────────────────────────────────────────────
//  Toate desenate pe grilă 24×24, contur de 2px, capete și colțuri rotunjite,
//  fără umplere. Consistență obligatorie: două iconițe din stiluri diferite
//  într-o singură secțiune se văd imediat și fac site-ul să pară improvizat.
//
//  ── DACĂ VREI MAI MULTE ───────────────────────────────────────────────────
//  Structura acceptă direct orice set compatibil. Lucide (licență ISC) și
//  Heroicons (MIT) sunt gratuite comercial, fără atribuire obligatorie, și
//  folosesc aceeași convenție 24×24 / stroke 2. Copiezi conținutul dintre
//  tagurile <svg> și îl adaugi ca intrare nouă mai jos.
// ============================================================================

/**
 * name → { label (pentru dropdown-ul din formular), body (SVG interior) }
 * Ordinea de aici e ordinea din formular; primele sunt cele mai folosite de
 * parcurile auto.
 */
export const SERVICE_ICONS = {
    shield: {
        label: 'Garanție',
        body: `<path d="M12 3 4 6.2v5.6c0 4.9 8 9.2 8 9.2s8-4.3 8-9.2V6.2L12 3z"/><path d="m8.8 12 2.2 2.2 4.2-4.2"/>`,
    },
    card: {
        label: 'Finanțare / rate',
        body: `<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/><path d="M6 15h3"/>`,
    },
    swap: {
        label: 'Buy-back / schimb',
        body: `<path d="M3.5 8.5h14"/><path d="m14.5 5.5 3 3-3 3"/><path d="M20.5 15.5h-14"/><path d="m9.5 12.5-3 3 3 3"/>`,
    },
    wrench: {
        label: 'Service / verificare tehnică',
        body: `<path d="M15.6 3.4a5.2 5.2 0 0 0-5.4 8.3l-6.5 6.5a1.9 1.9 0 0 0 2.7 2.7l6.5-6.5a5.2 5.2 0 0 0 6.3-7.4l-2.9 2.9-2.9-.7-.7-2.9 2.9-2.9z"/>`,
    },
    truck: {
        label: 'Transport / livrare',
        body: `<path d="M2.6 6.4h10.2v9.2H2.6z"/><path d="M12.8 9.6h3.9l3.3 3.3v2.7h-7.2z"/><circle cx="6.6" cy="17.6" r="1.6"/><circle cx="16.6" cy="17.6" r="1.6"/>`,
    },
    file: {
        label: 'Acte / înmatriculare',
        body: `<path d="M13.5 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5.5-5.5z"/><path d="M13.5 2.5V8H19"/><path d="M8.5 13h7"/><path d="M8.5 16.5h5"/>`,
    },
    umbrella: {
        label: 'Asigurări RCA / CASCO',
        body: `<path d="M3 12.5a9 9 0 0 1 18 0z"/><path d="M12 12.5v6a2.5 2.5 0 0 0 5 0"/>`,
    },
    key: {
        label: 'Test drive',
        body: `<circle cx="7.5" cy="16.5" r="3.5"/><path d="m10 14 8.5-8.5"/><path d="m15.5 9 2 2"/><path d="m18 6.5 2.5 2.5"/>`,
    },
    gauge: {
        label: 'Kilometraj verificat',
        body: `<path d="M4 17.5a9 9 0 1 1 16 0"/><path d="m12 14 4-4"/><circle cx="12" cy="15.5" r="1.4"/>`,
    },
    check: {
        label: 'Mașini verificate',
        body: `<circle cx="12" cy="12" r="9"/><path d="m8 12 2.8 2.8L16 9.5"/>`,
    },
    car: {
        label: 'Stoc variat',
        body: `<path d="M5 12.2 6.9 7.6A2 2 0 0 1 8.75 6.4h6.5a2 2 0 0 1 1.85 1.2l1.9 4.6"/><path d="M3.4 12.2h17.2v3.9a1 1 0 0 1-1 1H4.4a1 1 0 0 1-1-1z"/><circle cx="7.5" cy="17.6" r="1.6"/><circle cx="16.5" cy="17.6" r="1.6"/>`,
    },
    clock: {
        label: 'Program prelungit',
        body: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.5 2"/>`,
    },
    phone: {
        label: 'Consultanță',
        body: `<path d="M8.5 3.5h-3a2 2 0 0 0-2 2.2c.6 6.5 5.3 11.2 11.8 11.8a2 2 0 0 0 2.2-2v-3l-3.5-1.2-1.8 1.8a13 13 0 0 1-4.3-4.3l1.8-1.8L8.5 3.5z"/>`,
    },
    users: {
        label: 'Echipă cu experiență',
        body: `<circle cx="9" cy="8" r="3.3"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3.3 3.3 0 0 1 0 6.4"/><path d="M17.5 14.8a5.5 5.5 0 0 1 3 4.7"/>`,
    },
    tag: {
        label: 'Prețuri corecte',
        body: `<path d="M20.5 12.7 12.8 20.4a2 2 0 0 1-2.8 0l-6.4-6.4a2 2 0 0 1-.6-1.4V4.5a1 1 0 0 1 1-1h8.1a2 2 0 0 1 1.4.6l6.4 6.4a1.5 1.5 0 0 1 0 2.2z"/><circle cx="8" cy="8" r="1.4"/>`,
    },
    pin: {
        label: 'Locație accesibilă',
        body: `<path d="M12 21.5s7-6.3 7-11.2a7 7 0 1 0-14 0c0 4.9 7 11.2 7 11.2z"/><circle cx="12" cy="10" r="2.6"/>`,
    },
};

export const ICON_NAMES = Object.keys(SERVICE_ICONS);
export const DEFAULT_ICON = 'shield';

export const isValidIcon = (name) =>
    typeof name === 'string' && Object.hasOwn(SERVICE_ICONS, name);

/**
 * Randează o iconiță ca SVG inline.
 *
 * `stroke="currentColor"` e cheia: iconița moștenește culoarea elementului
 * părinte, deci preia automat accentul presetării fără nicio configurare.
 *
 * @param {string} name
 * @param {{ size?: number, className?: string, strokeWidth?: number }} opts
 */
export const renderIcon = (name, { size = 24, className = '', strokeWidth = 2 } = {}) => {
    const icon = SERVICE_ICONS[isValidIcon(name) ? name : DEFAULT_ICON];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
        `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" ` +
        `stroke-linecap="round" stroke-linejoin="round"${className ? ` class="${className}"` : ''} ` +
        `aria-hidden="true" focusable="false">${icon.body}</svg>`;
};

/** Lista pentru dropdown-ul din formularul de admin. */
export const iconOptions = () =>
    ICON_NAMES.map((name) => ({ name, label: SERVICE_ICONS[name].label }));

export default { SERVICE_ICONS, ICON_NAMES, DEFAULT_ICON, isValidIcon, renderIcon, iconOptions };
