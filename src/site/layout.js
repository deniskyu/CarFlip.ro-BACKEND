import { html, raw, toString, styleContent } from './html.js';
import { buildTheme } from './theme.js';
import { CSS_VERSION } from './styles.js';
import { ldToScript } from '../services/seo/jsonld.js';

// ============================================================================
//  src/site/layout.js
// ----------------------------------------------------------------------------
//  Shell-ul fiecărei pagini. Tot ce ține de <head> se decide aici, într-un
//  singur loc — inclusiv meta, Open Graph, canonical, `noindex` și datele
//  structurate.
//
//  ── DE CE TOT SEO-UL ÎNTR-UN SINGUR LOC ───────────────────────────────────
//  Împrăștiat prin pagini, s-ar fi întâmplat garantat: o pagină fără canonical,
//  alta fără `og:image`, a treia cu `noindex` uitat. Aici, o pagină nu POATE
//  fi randată fără head complet — datele lipsă produc valori implicite corecte,
//  nu tag-uri absente.
//
//  ── ORDINEA DIN <head> NU E ÎNTÂMPLĂTOARE ─────────────────────────────────
//  charset și viewport primele (browserul trebuie să știe cum să parseze
//  înainte de orice), apoi preconnect către CDN-ul de imagini (pornește
//  conexiunea TCP+TLS în paralel cu restul), apoi stilul. JSON-LD la final:
//  nu blochează nimic și nu e nevoie de el la prima pictură.
// ============================================================================

const DEFAULT_OG = 'https://media.car-flip.com/splash_logo.jpg';

/**
 * @param {object} opts
 * @param {object} opts.parc
 * @param {string} opts.path        calea curentă, pentru canonical
 * @param {{title,description}} opts.meta
 * @param {string} [opts.ogImage]
 * @param {'website'|'article'|'product'} [opts.ogType]
 * @param {object[]} [opts.jsonLd]  obiecte JSON-LD deja construite
 * @param {boolean} [opts.noindex]  forțează noindex indiferent de parc
 * @param {string} [opts.canonical] suprascrie URL-ul canonic (pagini filtrate)
 * @param {*} opts.body             conținutul paginii
 */
export const Layout = ({
    parc, path = '/', meta = {}, ogImage, ogType = 'website',
    jsonLd = [], noindex = false, canonical: canonicalOverride, body,
}) => {
    const { css } = buildTheme(parc);
    const origin = `https://${parc.subdomain}.car-flip.com`;
    // `canonical` explicit: paginile de stoc FILTRATE indică spre /stoc curat,
    // ca Google să nu indexeze zeci de combinații aproape identice.
    const canonical = canonicalOverride || `${origin}${path}`;
    const mediaOrigin = process.env.R2_PUBLIC_DOMAIN || 'https://media.car-flip.com';

    // Gardul de indexare: `indexable` se recalculează automat (vezi
    // services/indexableCheck.js) și blochează site-urile subțiri, ca să nu
    // afecteze semnalele de calitate ale întregului domeniu car-flip.com.
    const block = noindex || !parc.indexable || parc.active === false;

    const title = meta.title || parc.display_name;
    const description = meta.description || '';
    const image = ogImage || parc.banner_url || DEFAULT_OG;

    return toString(html`<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
${description ? html`<meta name="description" content="${description}">` : ''}
<link rel="canonical" href="${canonical}">
<meta name="robots" content="${block ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1'}">
<meta name="theme-color" content="${parc.accent_color || '#800000'}">
<meta name="format-detection" content="telephone=no">

<link rel="preconnect" href="${mediaOrigin}" crossorigin>
<link rel="dns-prefetch" href="${mediaOrigin}">
<!-- Favicon generat rotund din logo (vezi services/favicon.js). Browserul
     desenează fișierul exact cum e — CSS-ul nu ajunge în bara de tab-uri,
     deci rotunjirea trebuie făcută în imagine. -->
<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png">
<link rel="apple-touch-icon" href="${parc.logo_url}">

<link rel="stylesheet" href="/assets/site.${CSS_VERSION}.css">
<style>${styleContent(css)}</style>

<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${parc.display_name}">
<meta property="og:locale" content="ro_RO">
<meta property="og:title" content="${title}">
${description ? html`<meta property="og:description" content="${description}">` : ''}
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
${description ? html`<meta name="twitter:description" content="${description}">` : ''}
<meta name="twitter:image" content="${image}">
</head>
<body>
${body}
${jsonLd.filter(Boolean).map((ld) =>
    html`<script type="application/ld+json">${raw(ldToScript(ld))}</script>`)}
</body>
</html>`);
};

export default { Layout };
