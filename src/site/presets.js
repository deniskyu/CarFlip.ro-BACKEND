// ============================================================================
//  src/site/presets.js
// ----------------------------------------------------------------------------
//  Cele 6 presetări, în forma folosită la randare.
//
//  ⚠️ SINCRONIZARE: `name`, `summary` și `accents` trebuie să rămână identice
//  cu `src/lib/parcPresets.js` din panoul de admin. Acolo alegi presetarea,
//  aici se aplică. Dacă diverg, previzualizarea din formular minte.
//  `summary` e folosit și de pagina de comparație /_presetari.
//
//  ── CE E O PRESETARE ──────────────────────────────────────────────────────
//  Un STIL COMPLET, nu o paletă. Fiecare definește simultan: variantele de
//  componente, familia tipografică, scara de mărimi, rotunjimile, umbrele,
//  bordurile ȘI temporizarea animațiilor.
//
//  Motivul pentru care nu se combină între ele: un header centrat cu logo mare
//  peste un hero cu text tot centrat arată dezechilibrat, iar un card dens cu
//  specificații lângă un hero minimalist sunt două limbaje vizuale care se
//  ceartă. Fiecare combinație individuală e plauzibilă; unele perechi sunt
//  urâte, și nu afli care până nu le vezi.
//
//  ── FONTURI DE SISTEM, DELIBERAT ──────────────────────────────────────────
//  Zero fișiere de descărcat înseamnă: text vizibil instantaneu, fără FOUT,
//  fără CLS din schimbarea fontului, fără intrări suplimentare în CSP, fără
//  cost de lățime de bandă. Diferențierea vine din familie (sans / serif /
//  condensat), grosime, mărime și spațiere între litere.
//
//  Dacă vrei mai târziu fonturi proprii, se adaugă un singur `@font-face` per
//  presetare și se schimbă `fontSans` / `fontDisplay` — nimic altceva.
// ============================================================================

const SANS = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const SERIF = `ui-serif, Georgia, Cambria, "Times New Roman", serif`;
const COND = `"Arial Narrow", "Helvetica Neue Condensed", "Segoe UI", Roboto, sans-serif`;

export const PRESETS = [
    {
        id: 0,
        name: 'Clar',
        summary: 'Luminos și aerisit, tipografie mare',
        variants: { header: 'a', hero: 'a', card: 'a', services: 'a', footer: 'a', sticky: 'pill' , brand: 'a', menu: 'a' },
        fontDisplay: SANS,
        fontBody: SANS,
        bg: '#ffffff',
        surface: '#f7f7f8',
        text: '#111827',
        textMuted: '#5b6472',
        border: '#e5e7eb',
        headerBg: '#ffffff',
        headerText: '#111827',
        footerBg: '#111827',
        footerText: '#e5e7eb',
        radius: '14px',
        radiusSm: '9px',
        shadow: '0 1px 2px rgba(16,24,40,.06), 0 8px 24px rgba(16,24,40,.06)',
        borderWidth: '1px',
        displayWeight: 800,
        displayTracking: '-0.02em',
        heroMinH: '62vh',
        heroAnim: 'zoom',   // animația bannerului
        anim: { fast: '150ms', base: '240ms', slow: '380ms', ease: 'cubic-bezier(.22,.61,.36,1)', lift: '-3px' },
        accents: ['#800000', '#0f4c81', '#1f7a4d', '#b45309', '#6d28d9', '#be123c'],
    },
    {
        id: 1,
        name: 'Nocturn',
        summary: 'Întunecat premium, accente calde',
        variants: { header: 'b', hero: 'b', card: 'b', services: 'b', footer: 'b', sticky: 'circle' , brand: 'b', menu: 'b' },
        fontDisplay: SANS,
        fontBody: SANS,
        bg: '#0d0d0f',
        surface: '#16161a',
        text: '#f5f5f4',
        textMuted: '#a1a1aa',
        border: '#26262b',
        headerBg: 'rgba(13,13,15,.88)',
        headerText: '#f5f5f4',
        footerBg: '#08080a',
        footerText: '#a1a1aa',
        radius: '18px',
        radiusSm: '12px',
        shadow: '0 12px 40px rgba(0,0,0,.5)',
        borderWidth: '1px',
        displayWeight: 700,
        displayTracking: '-0.03em',
        heroMinH: '78vh',
        heroAnim: 'panx',   // animația bannerului
        anim: { fast: '200ms', base: '360ms', slow: '560ms', ease: 'cubic-bezier(.16,1,.3,1)', lift: '-5px' },
        accents: ['#e9b44c', '#d4d4d8', '#f97316', '#22d3ee', '#a3e635', '#f43f5e'],
    },
    {
        id: 2,
        name: 'Compact',
        summary: 'Dens, orientat pe specificații',
        variants: { header: 'c', hero: 'c', card: 'c', services: 'c', footer: 'a', sticky: 'bar' , brand: 'c', menu: 'c' },
        fontDisplay: SANS,
        fontBody: SANS,
        bg: '#f4f4f5',
        surface: '#ffffff',
        text: '#18181b',
        textMuted: '#52525b',
        border: '#d4d4d8',
        headerBg: '#ffffff',
        headerText: '#18181b',
        footerBg: '#18181b',
        footerText: '#d4d4d8',
        radius: '8px',
        radiusSm: '6px',
        shadow: '0 1px 3px rgba(0,0,0,.10)',
        borderWidth: '1px',
        displayWeight: 700,
        displayTracking: '-0.01em',
        heroMinH: '46vh',
        heroAnim: 'none',   // animația bannerului
        anim: { fast: '110ms', base: '170ms', slow: '240ms', ease: 'cubic-bezier(.4,0,.2,1)', lift: '-2px' },
        accents: ['#1d4ed8', '#0f766e', '#7c2d12', '#4338ca', '#a21caf', '#166534'],
    },
    {
        id: 3,
        name: 'Editorial',
        summary: 'Serif la titluri, elegant',
        variants: { header: 'a', hero: 'd', card: 'd', services: 'd', footer: 'c', sticky: 'pill' , brand: 'd', menu: 'd' },
        fontDisplay: SERIF,
        fontBody: SANS,
        bg: '#fdfcf9',
        surface: '#f6f3ec',
        text: '#1c1917',
        textMuted: '#6b6259',
        border: '#e3ddd2',
        headerBg: '#fdfcf9',
        headerText: '#1c1917',
        footerBg: '#1c1917',
        footerText: '#d6d0c6',
        radius: '4px',
        radiusSm: '3px',
        shadow: '0 2px 20px rgba(28,25,23,.07)',
        borderWidth: '1px',
        displayWeight: 600,
        displayTracking: '-0.01em',
        heroMinH: '70vh',
        heroAnim: 'kenburns',   // animația bannerului
        anim: { fast: '220ms', base: '420ms', slow: '640ms', ease: 'cubic-bezier(.19,1,.22,1)', lift: '-2px' },
        accents: ['#7c2d12', '#134e4a', '#3f3f46', '#831843', '#1e3a5f', '#713f12'],
    },
    {
        id: 4,
        name: 'Industrial',
        summary: 'Tehnic și precis, tipografie condensată',
        variants: { header: 'c', hero: 'a', card: 'c', services: 'c', footer: 'a', sticky: 'bar' , brand: 'c', menu: 'b' },
        fontDisplay: COND,
        fontBody: SANS,
        // REDESENAT: era tot negru, colțuri drepte, borduri groase — arăta
        // vechi. Acum păstrează caracterul tehnic (tipografie condensată,
        // etichete majuscule, contrast puternic la titluri), dar pe suprafețe
        // deschise, cu colțuri ușor rotunjite și umbre subtile.
        bg: '#eef1f5',
        surface: '#ffffff',
        text: '#141a22',
        textMuted: '#5a6472',
        border: '#d3d9e2',
        headerBg: '#1c2430',
        headerText: '#f2f5f9',
        footerBg: '#141a22',
        footerText: '#9fa9b7',
        radius: '10px',
        radiusSm: '7px',
        shadow: '0 1px 2px rgba(20,26,34,.05), 0 10px 28px rgba(20,26,34,.08)',
        borderWidth: '1px',
        displayWeight: 800,
        displayTracking: '0.005em',
        heroMinH: '60vh',
        heroAnim: 'zoomout',   // animația bannerului
        anim: { fast: '120ms', base: '200ms', slow: '300ms', ease: 'cubic-bezier(.22,.61,.36,1)', lift: '-3px' },
        accents: ['#c2372c', '#b45309', '#0369a1', '#15803d', '#334155', '#6d28d9'],
    },
    {
        id: 5,
        name: 'Cald',
        summary: 'Tonuri calde, colțuri rotunjite',
        variants: { header: 'b', hero: 'a', card: 'a', services: 'a', footer: 'c', sticky: 'pill' , brand: 'b', menu: 'a' },
        fontDisplay: SANS,
        fontBody: SANS,
        bg: '#fffbf5',
        surface: '#fff5e8',
        text: '#292524',
        textMuted: '#78716c',
        border: '#f0e3d2',
        headerBg: '#fffbf5',
        headerText: '#292524',
        footerBg: '#2b1c14',
        footerText: '#e7d9c9',
        radius: '22px',
        radiusSm: '16px',
        shadow: '0 4px 24px rgba(120,80,40,.10)',
        borderWidth: '1px',
        displayWeight: 800,
        displayTracking: '-0.02em',
        heroMinH: '64vh',
        heroAnim: 'panx',   // animația bannerului
        anim: { fast: '180ms', base: '300ms', slow: '460ms', ease: 'cubic-bezier(.34,1.3,.64,1)', lift: '-4px' },
        accents: ['#c2410c', '#a16207', '#15803d', '#9f1239', '#0e7490', '#6d28d9'],
    },
];

export const getPreset = (id) => {
    const n = Number(id);
    return PRESETS.find((p) => p.id === n) || PRESETS[0];
};

export default { PRESETS, getPreset };
