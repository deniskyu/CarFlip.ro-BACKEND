import { getPreset } from './presets.js';

// ============================================================================
//  src/site/theme.js
// ----------------------------------------------------------------------------
//  Traduce presetarea și culoarea de accent ale unui parc în variabilele CSS
//  injectate în <head>.
//
//  ── DE CE VARIABILE INLINE, DAR FOAIA DE STIL SEPARATĂ ────────────────────
//  Foaia de stil (~18KB) e IDENTICĂ pentru toate site-urile → merită să fie un
//  fișier cacheabil, descărcat o dată și refolosit pe toate paginile și de
//  toate site-urile pe care le vizitează același om.
//
//  Variabilele diferă de la parc la parc, dar au ~600 de octeți → inline în
//  <head>. Zero cereri suplimentare, zero blocare la randare, iar culorile sunt
//  aplicate din prima pictură. Dacă ar fi fost și ele într-un fișier, pagina ar
//  fi clipit cu culorile implicite înainte să se încarce.
//
//  ── GARDA DE CONTRAST ─────────────────────────────────────────────────────
//  Accentele sunt pre-validate în formular, dar verificarea se face și aici.
//  E ultima linie de apărare: dacă vreodată un accent ajunge în DB pe altă
//  cale (import, editare directă în Compass, un bug), textul de pe butoane nu
//  trebuie să devină ilizibil.
// ============================================================================

const hexToRgb = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
};

/** Luminanță relativă, formula WCAG 2.1. */
const luminance = ({ r, g, b }) => {
    const f = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const contrast = (a, b) => {
    const l1 = luminance(a), l2 = luminance(b);
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
};

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 17, g: 17, b: 17 };

/** Alege alb sau negru pentru text peste accent, după contrastul real. */
const onColor = (rgb) => (contrast(rgb, WHITE) >= contrast(rgb, BLACK) ? '#ffffff' : '#111111');

const toHex = ({ r, g, b }) =>
    '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');

const mix = (a, b, amount) => ({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
});

/**
 * Corectează un accent care nu are contrast suficient cu fundalul presetării.
 *
 * ⚠️ Direcția depinde de fundal. Pe o presetare deschisă (Clar, Editorial)
 * accentul se ÎNTUNECĂ; pe una întunecată (Nocturn) se LUMINEAZĂ. Varianta
 * care întuneca mereu funcționa pe fundal alb, dar pe fundal negru făcea un
 * accent închis și mai închis — exact invers decât trebuie.
 */
const ensureUsableAccent = (rgb, bgRgb) => {
    // Fundal întunecat → luminăm. Fundal deschis → întunecăm.
    const target = luminance(bgRgb) < 0.25 ? WHITE : BLACK;
    let cur = rgb;
    for (let i = 0; i < 14 && contrast(cur, bgRgb) < 3; i++) {
        cur = mix(cur, target, 0.12);
    }
    return cur;
};

/**
 * Construiește blocul de variabile CSS pentru un parc.
 * @param {object} parc
 * @returns {{ css: string, preset: object, accent: string, onAccent: string }}
 */
export const buildTheme = (parc) => {
    const preset = getPreset(parc?.preset);

    const bgRgb = hexToRgb(preset.bg) || WHITE;
    const rawAccent = hexToRgb(parc?.accent_color) || hexToRgb(preset.accents[0]) || { r: 128, g: 0, b: 0 };
    const accentRgb = ensureUsableAccent(rawAccent, bgRgb);

    const accent = toHex(accentRgb);
    const onAccent = onColor(accentRgb);
    const accentDark = toHex(mix(accentRgb, BLACK, 0.18));
    const accentSoft = toHex(mix(accentRgb, bgRgb, 0.88));   // fundal foarte deschis
    const accentLine = toHex(mix(accentRgb, bgRgb, 0.62));

    const a = preset.anim;

    const css = [
        `--bg:${preset.bg}`,
        `--surface:${preset.surface}`,
        `--text:${preset.text}`,
        `--muted:${preset.textMuted}`,
        `--border:${preset.border}`,
        `--border-w:${preset.borderWidth}`,
        `--header-bg:${preset.headerBg}`,
        `--header-text:${preset.headerText}`,
        `--footer-bg:${preset.footerBg}`,
        `--footer-text:${preset.footerText}`,
        `--accent:${accent}`,
        `--on-accent:${onAccent}`,
        `--accent-dark:${accentDark}`,
        `--accent-soft:${accentSoft}`,
        `--accent-line:${accentLine}`,
        `--radius:${preset.radius}`,
        `--radius-sm:${preset.radiusSm}`,
        `--shadow:${preset.shadow}`,
        `--font-display:${preset.fontDisplay}`,
        `--font-body:${preset.fontBody}`,
        `--display-weight:${preset.displayWeight}`,
        `--display-tracking:${preset.displayTracking}`,
        `--hero-min-h:${preset.heroMinH}`,
        `--t-fast:${a.fast}`,
        `--t-base:${a.base}`,
        `--t-slow:${a.slow}`,
        `--ease:${a.ease}`,
        `--lift:${a.lift}`,
    ].join(';');

    return { css: `:root{${css}}`, preset, accent, onAccent };
};

export default { buildTheme };
