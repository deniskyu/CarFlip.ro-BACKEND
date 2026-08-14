// ============================================================================
//  src/utils/siteErrorPages.js
// ----------------------------------------------------------------------------
//  Paginile de eroare servite pe subdomenii. Deliberat fără dependențe și fără
//  acces la baza de date: trebuie să funcționeze exact în situațiile în care
//  altceva nu funcționează.
//
//  Trei lucruri obligatorii, ușor de ratat:
//   • status HTTP REAL (404 / 410), nu 200 cu text de eroare. Un „soft 404"
//     face Google să indexeze pagini inexistente și strică semnalele de
//     calitate ale întregului domeniu car-flip.com.
//   • X-Robots-Tag: noindex — subdomeniile inventate de boți nu au ce căuta
//     în index.
//   • Cache-Control scurt, nu zero. Un wildcard DNS atrage scanere; lăsăm
//     Cloudflare să absoarbă valul, dar nu atât de mult încât un parc nou creat
//     să pară inexistent minute în șir.
// ============================================================================

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.mobilefrontendframe';
const APP_STORE = 'https://apps.apple.com/ro/app/id6760683057';

const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const shell = ({ icon, title, message, showApp = true }) => `<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} — CarFlip.ro</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#800000;color:#fff;min-height:100vh;display:flex;flex-direction:column;
       align-items:center;justify-content:center;padding:32px 20px;text-align:center;
       font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
       -webkit-font-smoothing:antialiased}
  .logo{font-size:24px;font-weight:900;letter-spacing:.5px;margin-bottom:32px}
  .logo span{color:#ffcccc}
  .card{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);
        border-radius:18px;padding:34px 26px;max-width:380px;width:100%}
  .icon{font-size:34px;margin-bottom:14px}
  h1{font-size:19px;font-weight:700;margin-bottom:10px}
  p{font-size:14px;line-height:1.6;color:rgba(255,255,255,.6)}
  .actions{margin-top:26px;display:flex;flex-direction:column;gap:10px;align-items:center}
  a.btn{display:inline-block;background:#fff;color:#800000;text-decoration:none;
        padding:12px 30px;border-radius:26px;font-size:14px;font-weight:700;
        min-width:220px;transition:transform .15s}
  a.btn:active{transform:scale(.97)}
  a.btn.ghost{background:rgba(255,255,255,.1);color:#fff;
              border:1px solid rgba(255,255,255,.2);font-weight:600}
  .foot{margin-top:34px;font-size:12px;color:rgba(255,255,255,.35)}
  @media(min-width:480px){.actions{flex-direction:row;justify-content:center}
    a.btn{min-width:0}}
</style>
</head>
<body>
  <div class="logo">Car<span>Flip</span>.ro</div>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${message}</p>
    ${showApp ? `<div class="actions">
      <a class="btn" href="https://car-flip.com">Mergi la CarFlip</a>
      <a class="btn ghost" href="${APP_STORE}">App Store</a>
      <a class="btn ghost" href="${PLAY_STORE}">Google Play</a>
    </div>` : ''}
  </div>
  <p class="foot">Mii de mașini, într-o singură aplicație.</p>
</body>
</html>`;

/** Subdomeniu inexistent sau parc dezactivat. */
export const renderSiteNotFound = (res) => {
    res.status(404)
        .set('Content-Type', 'text/html; charset=utf-8')
        .set('X-Robots-Tag', 'noindex, nofollow')
        .set('Cache-Control', 'public, max-age=60')
        .send(shell({
            icon: '🔍',
            title: 'Site inexistent',
            message: 'Adresa aceasta nu corespunde niciunui parc auto activ. Verifică linkul sau caută mașina direct în aplicația CarFlip.',
        }));
};

/** Pagină inexistentă ÎN INTERIORUL unui site valid (mașină ștearsă, URL greșit). */
export const renderPageNotFound = (res, parc) => {
    const name = parc?.display_name ? escapeHtml(parc.display_name) : 'acest parc auto';
    res.status(404)
        .set('Content-Type', 'text/html; charset=utf-8')
        .set('X-Robots-Tag', 'noindex, nofollow')
        .set('Cache-Control', 'public, max-age=60')
        .send(shell({
            icon: '🚗',
            title: 'Pagină indisponibilă',
            message: `Pagina căutată nu mai există pe site-ul ${name}. Poate anunțul a fost șters sau mașina a fost deja vândută.`,
        }));
};

/** Eroare internă, servită fără să atingă baza de date. */
export const renderSiteError = (res) => {
    res.status(500)
        .set('Content-Type', 'text/html; charset=utf-8')
        .set('X-Robots-Tag', 'noindex, nofollow')
        .set('Cache-Control', 'no-store')
        .send(shell({
            icon: '⚠️',
            title: 'Ceva nu a mers bine',
            message: 'Site-ul întâmpină o problemă temporară. Încearcă din nou în câteva momente.',
            showApp: false,
        }));
};

export default { renderSiteNotFound, renderPageNotFound, renderSiteError };
