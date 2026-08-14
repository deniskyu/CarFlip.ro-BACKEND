import { Router } from 'express';
import sales from '../models/salesModel.js';
import { siteLimiter } from '../utils/rateLimiters.js';
import { renderPageNotFound } from '../utils/siteErrorPages.js';

// ============================================================================
//  src/routes/siteTestRoute.js          ⚠️  TEMPORAR — se șterge la Batch 6
// ----------------------------------------------------------------------------
//  Confirmă vizual că lanțul complet funcționează:
//    DNS wildcard → Cloudflare → Express → resolveParc → Redis → Mongo
//
//  Afișează parcul rezolvat, dacă a venit din cache sau din Mongo, și numărul
//  real de mașini din stocul dealerului. Dacă pagina asta se încarcă corect,
//  toată fundația e în picioare și Batch 6 nu are surprize.
//
//  ── PARTEA CARE RĂMÂNE ────────────────────────────────────────────────────
//  Middleware-ul `blockMainSiteLeak` de la finalul fișierului NU e temporar ca
//  idee, doar ca amplasare. Fără el, `bogdan.car-flip.com/post/123` ar servi
//  pagina de deep-link CarFlip, iar `bogdan.car-flip.com/` ar fi putut ajunge
//  la landing page-ul CarFlip din userActions.js — adică site-ul dealerului ar
//  scurge conținut de-al tău. La Batch 6 logica se mută în ruta reală de site.
// ============================================================================

const siteTestRoute = Router();

const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

siteTestRoute.get('/', siteLimiter, async (req, res, next) => {
    // Nu suntem pe un subdomeniu de parc → lăsăm rutele existente să răspundă.
    if (!req.isSite || !req.parc) return next();

    const p = req.parc;
    let stoc = null;
    let dbError = null;

    try {
        stoc = await sales.countDocuments({ user_id: p.user_id, is_active: true });
    } catch (err) {
        dbError = err.message;
    }

    const row = (label, value, ok = null) => `
      <tr>
        <td>${esc(label)}</td>
        <td class="${ok === null ? '' : ok ? 'ok' : 'bad'}">${value}</td>
      </tr>`;

    res.status(200)
        .set('Content-Type', 'text/html; charset=utf-8')
        .set('X-Robots-Tag', 'noindex, nofollow')
        .set('Cache-Control', 'no-store')
        .send(`<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Test rutare — ${esc(p.display_name)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0a0a0a;color:#eee;min-height:100vh;padding:28px 18px;
       font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
       -webkit-font-smoothing:antialiased}
  .wrap{max-width:640px;margin:0 auto}
  .badge{display:inline-block;background:#1e2a4a;color:#7aa2f7;padding:5px 12px;
         border-radius:6px;font-size:11px;font-weight:700;letter-spacing:.5px;margin-bottom:18px}
  h1{font-size:22px;margin-bottom:6px}
  .sub{color:#888;font-size:14px;margin-bottom:26px}
  .brand{display:flex;align-items:center;gap:14px;background:#141414;border:1px solid #222;
         border-radius:14px;padding:16px;margin-bottom:18px}
  .brand img{width:56px;height:56px;border-radius:14px;object-fit:contain;background:#fff;flex-shrink:0}
  .banner{width:100%;height:150px;object-fit:cover;border-radius:14px;
          border:1px solid #222;margin-bottom:18px;display:block}
  table{width:100%;border-collapse:collapse;background:#141414;
        border:1px solid #222;border-radius:14px;overflow:hidden}
  td{padding:11px 14px;font-size:13px;border-bottom:1px solid #1c1c1c}
  tr:last-child td{border-bottom:none}
  td:first-child{color:#888;width:44%}
  td:last-child{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#ddd}
  .ok{color:#44bb44}.bad{color:#ff4444}
  .note{margin-top:22px;padding:14px;background:#12180f;border:1px solid #24331c;
        border-radius:12px;font-size:12.5px;line-height:1.6;color:#9ab88a}
  .swatch{display:inline-block;width:12px;height:12px;border-radius:3px;
          vertical-align:middle;margin-right:6px;border:1px solid #333}
</style>
</head>
<body>
<div class="wrap">
  <div class="badge">BATCH 2 · TEST DE RUTARE</div>
  <h1>${esc(p.display_name)}</h1>
  <div class="sub">${esc(p.city)}, ${esc(p.county)}</div>

  ${p.banner_url ? `<img class="banner" src="${esc(p.banner_url)}" alt="">` : ''}
  <div class="brand">
    ${p.logo_url ? `<img src="${esc(p.logo_url)}" alt="">` : ''}
    <div>
      <div style="font-weight:700">${esc(p.display_name)}</div>
      <div style="color:#888;font-size:12.5px;margin-top:3px">${esc(p.company_name)}</div>
    </div>
  </div>

  <table>
    ${row('Hostname', esc(req.hostname))}
    ${row('Subdomeniu', esc(p.subdomain))}
    ${row('user_id', esc(p.user_id))}
    ${row('Mașini active în stoc', dbError ? `EROARE: ${esc(dbError)}` : stoc, !dbError)}
    ${row('Presetare', `#${p.preset}`)}
    ${row('Culoare accent', `<span class="swatch" style="background:${esc(p.accent_color)}"></span>${esc(p.accent_color)}`)}
    ${row('WhatsApp', esc(p.whatsapp))}
    ${row('Telefon', esc(p.phone))}
    ${row('Coordonate', `${p.lat}, ${p.lng}`)}
    ${row('active', String(p.active), p.active === true)}
    ${row('indexable', String(p.indexable), p.indexable === false)}
    ${row('Cuvinte cheie SEO', (p.seo_keywords || []).length ? esc((p.seo_keywords || []).join(' · ')) : '—')}
    ${row('Zonă deservită', (p.seo_service_area || []).length ? esc((p.seo_service_area || []).join(' · ')) : '—')}
    ${row('notes expus public', 'notes' in p ? 'DA — PROBLEMĂ' : 'nu (corect)', !('notes' in p))}
  </table>

  <div class="note">
    <strong>Dacă vezi pagina asta, fundația funcționează:</strong> DNS wildcard →
    Cloudflare → Express → resolveParc → Redis → Mongo. Verifică în tabel că
    numărul de mașini e cel real și că <code>notes</code> nu e expus.
    <br><br>
    <code>indexable: false</code> e corect acum — se activează automat abia când
    site-ul are conținut suficient (Batch 3).
  </div>
</div>
</body>
</html>`);
});

// ── Garda anti-scurgere ─────────────────────────────────────────────────────
// Orice cale nerezolvată pe un subdomeniu de parc se oprește AICI, cu 404.
// Fără ea, request-urile ar curge în `indexRoute` și un vizitator de pe
// bogdan.car-flip.com ar primi landing page-ul CarFlip sau paginile de
// deep-link — conținut care nu are ce căuta pe site-ul unui dealer.
//
// Excepția pentru `/api/` e intenționată: aplicația mobilă și panourile pot
// folosi orice host, iar API-ul nu depinde de tenant.
siteTestRoute.use((req, res, next) => {
    if (!req.isSite) return next();
    if (req.path.startsWith('/api/')) return next();
    if (req.path.startsWith('/.well-known/')) return next();
    return renderPageNotFound(res, req.parc);
});

export default siteTestRoute;
