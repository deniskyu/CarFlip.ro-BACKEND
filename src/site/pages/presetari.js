import { html, toString, styleContent } from '../html.js';
import { PRESETS, getPreset } from '../presets.js';
import { buildTheme } from '../theme.js';

// ============================================================================
//  src/site/pages/presetari.js
// ----------------------------------------------------------------------------
//  Pagina internă de comparație: toate cele 6 presetări, una lângă alta, în
//  iframe-uri la lățime de telefon.
//
//  ── DE CE IFRAME-URI ȘI NU CAPTURI ────────────────────────────────────────
//  Sunt site-urile REALE, cu stocul real. Poți derula în fiecare, apăsa
//  butoane, deschide galeria. O captură ar arăta doar prima imagine statică și
//  ar minți despre cum se comportă pagina.
//
//  ⚠️ NECESITĂ `frame-ancestors 'self'` în CSP. Valoarea din Batch 2 era
//  `'none'`, care blochează încorporarea inclusiv de pe același origin. Vezi
//  instrucțiunile de instalare — e o modificare de un cuvânt în `server.js`,
//  iar `'self'` protejează în continuare complet împotriva clickjacking-ului
//  de pe alte domenii.
//
//  Pagina e `noindex` și nu apare nicăieri în navigație.
// ============================================================================

export const renderPresetari = (parc) => {
    const base = `https://${parc.subdomain}.car-flip.com`;

    const body = html`
<div class="pv-head">
  <h1>Presetări de design — ${parc.display_name}</h1>
  <p>
    Toate cele 6 presetări, cu stocul real al acestui parc. Sunt site-uri
    funcționale: poți derula, apăsa butoane și deschide galeria în fiecare.
    Lățimea cadrelor imită un telefon — acolo se decide dacă designul merge.
    <br>Presetarea activă acum: <strong>#${parc.preset} ${getPreset(parc.preset).name}</strong>.
  </p>
</div>

<div class="pv-grid">
  ${PRESETS.map((p) => {
      const theme = buildTheme({ ...parc, preset: p.id, accent_color: p.accents[0] });
      return html`
  <div class="pv-card">
    <div class="pv-bar">
      <span class="pv-dot" style="background:${theme.accent}"></span>
      <b>#${p.id} ${p.name}</b>
      <span>${p.summary}</span>
      <a href="${base}/?__preset=${p.id}" target="_blank" rel="noopener">deschide ↗</a>
    </div>
    <iframe class="pv-frame" src="/?__preset=${p.id}" loading="lazy"
            title="Presetarea ${p.name}"></iframe>
  </div>`;
  })}
</div>`;

    // Shell propriu, deliberat: pagina asta nu e un site de parc, e o unealtă
    // internă. Nu moștenește tema niciunui parc și nu trebuie să arate ca el.
    return toString(html`<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Presetări — ${parc.display_name}</title>
<style>${styleContent(`
body{background:#0a0a0a;color:#e8e8e8;font-family:system-ui,-apple-system,sans-serif;margin:0;padding:20px}
*{box-sizing:border-box}
`)}</style>
<link rel="stylesheet" href="/assets/site.v3.css">
</head>
<body class="pv-body">
${body}
</body>
</html>`);
};

export default { renderPresetari };
