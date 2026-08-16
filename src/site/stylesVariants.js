// ============================================================================
//  src/site/stylesVariants.js
// ----------------------------------------------------------------------------
//  Stilurile variantelor de componente. A treia și ultima bucată de CSS,
//  concatenată în ruta care servește foaia de stil.
//
//  Structura pe trei fișiere nu e din întâmplare:
//    styles.js        — baza comună, valabilă pentru orice presetare
//    stylesPages.js   — paginile interioare
//    stylesVariants.js— DOAR ce diferă de la o presetare la alta
//
//  Așa se vede dintr-o privire ce e comun și ce e variație, iar o corectură
//  în baza comună se aplică simultan la toate cele 6 presetări.
// ============================================================================

export const VARIANTS_CSS = `
/* ══ HEADER ══════════════════════════════════════════════════════════════ */

/* b — mai înalt, meniu împins la dreapta, efect de sticlă mai pronunțat */
.hdr--b .header-inner{min-height:78px}
.hdr--b .nav{margin-left:auto;margin-right:.6rem}
.hdr--b .brand-name{font-size:1.1rem}
.hdr--b .brand-logo{width:46px;height:46px}
@supports (backdrop-filter: blur(1px)){
  .hdr--b{backdrop-filter:saturate(160%) blur(18px)}
}

/* c — bandă subțire deasupra, cu adresă, program și telefon */
.hdr--c .header-inner{min-height:58px}
.hdr--c .brand-logo{width:38px;height:38px}
.hdr-strip{
  background:var(--accent);color:var(--on-accent);
  font-size:.78rem;font-weight:600;
}
.hdr-strip-in{
  display:flex;flex-wrap:wrap;align-items:center;gap:.4rem 1.4rem;
  padding-block:.45rem;justify-content:center;
}
.hdr-strip-in span,.hdr-strip-in a{display:inline-flex;align-items:center;gap:.35rem}
.hdr-strip-in a:hover{text-decoration:underline}
/* Pe telefon rămâne doar adresa: restul e deja în antetul principal. */
@media(max-width:559px){.hdr-strip-in > *:not(:first-child){display:none}}

/* ══ HERO ════════════════════════════════════════════════════════════════ */

.hero--b .hero-inner,.hero--d .hero-inner{
  max-width:54rem;margin-inline:auto;text-align:center;
}
.hero--b .hero-actions,.hero--d .hero-actions{justify-content:center}
.hero--b .hero-sub,.hero--d .hero-sub{margin-inline:auto}
.hero--b h1{font-size:clamp(2.1rem,1.2rem + 4vw,4.2rem)}
.hero--b .hero-inner{padding-block:clamp(3rem,2rem + 5vw,7rem)}

/* c — bandă scurtă, cu un rând de cifre în loc de contorul simplu */
.hero--c .hero-inner{padding-block:clamp(1.8rem,1.2rem + 2.6vw,3.2rem)}
.hero--c h1{font-size:clamp(1.6rem,1.1rem + 2.2vw,2.7rem)}
.hero-stats{
  display:flex;flex-wrap:wrap;gap:1.4rem 2.4rem;margin-top:1.3rem;
  padding-top:1.2rem;border-top:1px solid rgba(255,255,255,.22);
}
.hero-stats div{display:flex;flex-direction:column;line-height:1.15}
.hero-stats b{font-family:var(--font-display);font-size:clamp(1.5rem,1.2rem + 1.2vw,2.2rem);
  font-weight:var(--display-weight);color:#fff}
.hero-stats span{font-size:.8rem;color:rgba(255,255,255,.72);margin-top:.2rem}

/* d — linie subțire și supratitlu deasupra, mai mult aer */
.hero-rule{display:block;width:56px;height:2px;background:rgba(255,255,255,.7);
  margin:0 auto 1.1rem}
.hero-eyebrow{font-size:.78rem;letter-spacing:.22em;text-transform:uppercase;
  color:rgba(255,255,255,.82);margin-bottom:.9rem}
.hero--d h1{font-weight:var(--display-weight);letter-spacing:-.005em}
.hero--d .hero-inner{padding-block:clamp(2.8rem,2rem + 4vw,6rem)}

/* ══ CARD DE MAȘINĂ ══════════════════════════════════════════════════════ */

.car-noimg{width:100%;height:100%;
  background:linear-gradient(135deg,var(--surface),var(--border))}

/* a — SINGURA variantă care suprapune prețul peste fotografie.
   '.car-media' e deja 'position:relative', deci ancorarea e față de imagine,
   nu față de card. */
.car--a .car-media .car-price{position:absolute;left:.7rem;bottom:.7rem;z-index:1}
.car--a .car-media .car-neg{position:absolute;right:.7rem;bottom:.7rem;z-index:1}

/* Pentru b, c și d prețul stă în fluxul normal, în '.car-priceline', fără
   fundal colorat — culoarea de accent o poartă textul. */
.car--b .car-price,.car--c .car-price,.car--d .car-price{
  background:none;padding:0;border-radius:0;
}
.car--b .car-neg,.car--c .car-neg,.car--d .car-neg{
  background:none;padding:0;border-radius:0;
}

/* b — preț mare sub poză, specificații ca pastile */
.car--b .car-media{aspect-ratio:16/11}
.car--b .car-body{padding:1.05rem 1.1rem 1.15rem;gap:.7rem}
.car--b .car-priceline{display:flex;align-items:baseline;gap:.6rem}
.car--b .car-price{font-family:var(--font-display);font-size:1.5rem;
  font-weight:var(--display-weight);color:var(--accent);letter-spacing:-.02em}
.car--b .car-neg{font-size:.75rem;color:var(--muted);font-weight:600}
.car--b .car-title{font-size:.98rem;font-weight:600;color:var(--muted)}
.car-specs--chips{gap:.4rem}
.car-specs--chips li{padding:.25rem .6rem;border-radius:100px;
  background:var(--bg);border:1px solid var(--border);font-size:.76rem}
.car-specs--chips li+li::before{display:none}
.car--b .car-wa{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
.car--b .car-wa:hover{background:var(--accent-dark);border-color:var(--accent-dark)}

/* c — dens: preț pe același rând, spații mici, imagine mai lată */
.car--c .car-media{aspect-ratio:16/10}
.car--c .car-body{padding:.7rem .85rem .85rem;gap:.42rem}
.car--c .car-priceline{display:flex;align-items:baseline;gap:.5rem}
.car--c .car-price{font-size:1.16rem;font-weight:800;color:var(--accent)}
.car--c .car-neg{font-size:.72rem;color:var(--muted);font-weight:600}
.car--c .car-title{font-size:.93rem;-webkit-line-clamp:1}
.car--c .car-specs{font-size:.79rem}
.car--c .car-wa{padding:.55rem;font-size:.83rem;min-height:40px}

/* d — cadru subțire, titlu serif, preț la dreapta */
.car--d{background:var(--bg);border-width:1px}
.car--d .car-media{aspect-ratio:3/2;margin:.55rem .55rem 0;border-radius:2px;
  width:calc(100% - 1.1rem)}
.car--d .car-body{padding:1rem .95rem 1.05rem;gap:.55rem}
.car--d .car-priceline{display:flex;justify-content:space-between;align-items:baseline;
  order:2;padding-top:.6rem;border-top:1px solid var(--border)}
.car--d .car-title{order:1;font-family:var(--font-display);font-weight:var(--display-weight);
  font-size:1.06rem}
.car--d .car-specs{order:1;font-size:.82rem}
.car--d .car-price{font-family:var(--font-display);font-size:1.22rem;
  font-weight:var(--display-weight);color:var(--text)}
.car--d .car-neg{font-size:.74rem;color:var(--muted)}
.car--d .car-foot{order:3}
.car--d .car-wa{border:none;border-bottom:1px solid var(--accent-line);
  border-radius:0;padding:.5rem 0;justify-content:flex-start;min-height:0}
.car--d .car-wa:hover{background:none;color:var(--accent-dark);border-color:var(--accent)}
.car--d .car-body{display:flex;flex-direction:column}

/* ══ FOOTER ══════════════════════════════════════════════════════════════ */

.footer-addr{font-size:.9rem;opacity:.8;line-height:1.7;
  display:flex;align-items:center;gap:.4rem}

/* b — două coloane sus, programul pe un rând orizontal dedesubt */
.ftr--b .footer-grid{grid-template-columns:1fr}
@media(min-width:700px){.ftr--b .footer-grid{grid-template-columns:1.5fr 1fr}}
.footer-hours-row{margin-top:2rem;padding-top:1.6rem;
  border-top:1px solid rgba(255,255,255,.12)}
.footer-hours-row h4{margin-bottom:1rem}
.ftr--b .footer-hours-row{display:grid;gap:.35rem 1.6rem;
  grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.ftr--b .footer-hours-row h4{grid-column:1/-1}
.ftr--b .footer-legal{align-items:center;text-align:center}
.ftr--b .footer-links,.ftr--b .footer-made{justify-content:center}
.ftr--b .footer-firm{text-align:center}

/* c — bloc de brand centrat deasupra, apoi coloanele */
.footer-hero{text-align:center;padding-bottom:2rem;margin-bottom:2rem;
  border-bottom:1px solid rgba(255,255,255,.12)}
.ftr--c .footer-hero .footer-brand{justify-content:center}
.ftr--c .footer-hero .footer-addr{justify-content:center}
.ftr--c .footer-hero .footer-social{justify-content:center}
.ftr--c .footer-hero .store-badges{justify-content:center}
.ftr--c .footer-grid{grid-template-columns:1fr}
@media(min-width:700px){.ftr--c .footer-grid{grid-template-columns:1fr 1fr}}

/* ══ PAGINA DE COMPARAȚIE A PRESETĂRILOR ═════════════════════════════════ */
/* Servită doar pe /_presetari, în afara oricărui site public. */
.pv-body{background:#0a0a0a;color:#e8e8e8;font-family:system-ui,sans-serif;
  margin:0;padding:20px}
.pv-head{max-width:1400px;margin:0 auto 18px}
.pv-head h1{font-size:19px;margin-bottom:6px;color:#fff}
.pv-head p{font-size:13px;color:#888;line-height:1.6}
.pv-grid{max-width:1400px;margin:0 auto;display:grid;gap:18px;
  grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.pv-card{background:#141414;border:1px solid #262626;border-radius:14px;overflow:hidden}
.pv-bar{display:flex;align-items:center;gap:10px;padding:11px 14px;
  border-bottom:1px solid #232323}
.pv-bar b{font-size:14px;color:#fff}
.pv-bar span{font-size:11.5px;color:#888}
.pv-bar a{margin-left:auto;font-size:11.5px;color:#7aa2f7;text-decoration:none}
.pv-bar a:hover{text-decoration:underline}
.pv-dot{width:11px;height:11px;border-radius:3px;flex-shrink:0}
.pv-frame{width:100%;height:660px;border:0;display:block;background:#fff}

/* ══ BLOCUL DE BRAND — 4 variante ════════════════════════════════════════ */
/* Înainte era identic la toate presetările: logo rotund, nume, oraș dedesubt.
   Antetul e primul lucru pe care îl vede omul; dacă e la fel peste tot, toate
   site-urile par același șablon. */

/* a — logo rotund, nume peste oraș (varianta clasică) */
.brand--a .brand-logo{border-radius:50%}

/* b — logo pătrat rotunjit, mai mare, oraș ca etichetă sub nume */
.brand--b .brand-logo{border-radius:calc(var(--radius) * .55);width:48px;height:48px;padding:4px}
.brand--b .brand-name{font-size:1.12rem}
.brand--b .brand-city{
  display:inline-block;margin-top:.15rem;padding:.1rem .45rem;
  border-radius:100px;background:var(--accent-soft);color:var(--accent);
  font-size:.62rem;letter-spacing:.1em;opacity:1;
}

/* c — fără logo în antet: doar numele, mare, cu bară de accent în stânga */
.brand--c .brand-logo{display:none}
.brand--c .brand{padding-left:.7rem;border-left:3px solid var(--accent)}
.brand--c .brand-name{font-size:1.08rem;text-transform:uppercase;letter-spacing:.03em}
.brand--c .brand-city{font-size:.68rem;letter-spacing:.12em}

/* d — logo încadrat, nume și oraș pe același rând, separate prin punct */
.brand--d .brand-logo{border-radius:2px;border:2px solid var(--accent);padding:4px}
.brand--d .brand-name{display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap}
.brand--d .brand-city{display:inline;font-size:.7rem;letter-spacing:.14em}
.brand--d .brand-city::before{content:'· '}

/* ══ MENIUL MOBIL — 4 variante ═══════════════════════════════════════════ */
/* Aceeași structură (checkbox + selector de vecin, zero JavaScript), dar
   deschidere și aspect diferite. */

/* a — listă simplă, linii despărțitoare */
.menu--a .nav-mobile a{padding:.9rem .25rem}

/* b — panou pe fundal de accent, linkuri mari, intrare de sus */
.menu--b .nav-mobile{
  background:var(--accent);margin-inline:calc(-1 * (100vw - 100%) / 2);
  padding-inline:calc((100vw - 100%) / 2);border-top:none;
}
.menu--b .nav-mobile a{
  color:var(--on-accent);font-size:1.05rem;font-weight:700;
  padding:1rem .25rem;border-bottom-color:rgba(255,255,255,.18);
}
@media(prefers-reduced-motion:no-preference){
  .menu--b .nav-toggle:checked ~ .nav-mobile{animation:menu-drop var(--t-base) var(--ease) both}
  @keyframes menu-drop{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
}

/* c — grilă de două coloane, compact, ca un panou de comenzi */
.menu--c .nav-mobile{display:none;padding:.6rem 0 .9rem}
.menu--c .nav-toggle:checked ~ .nav-mobile{display:grid;grid-template-columns:1fr 1fr;gap:.4rem}
.menu--c .nav-mobile a{
  border:var(--border-w) solid var(--border);border-radius:var(--radius-sm);
  text-align:center;padding:.75rem .5rem;font-size:.9rem;
}
.menu--c .nav-mobile a:last-child{grid-column:1/-1}

/* d — linkuri centrate, cu spațiu generos și linie de accent deasupra */
.menu--d .nav-mobile{border-top:2px solid var(--accent);text-align:center}
.menu--d .nav-mobile a{
  padding:1.05rem .25rem;border-bottom:none;font-family:var(--font-display);
  font-size:1.1rem;letter-spacing:var(--display-tracking);
}
@media(prefers-reduced-motion:no-preference){
  .menu--d .nav-toggle:checked ~ .nav-mobile a{animation:menu-fade var(--t-base) var(--ease) both}
  .menu--d .nav-toggle:checked ~ .nav-mobile a:nth-child(2){animation-delay:50ms}
  .menu--d .nav-toggle:checked ~ .nav-mobile a:nth-child(3){animation-delay:100ms}
  @keyframes menu-fade{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
}

/* ══ PRESETAREA 4 — INDUSTRIAL, REDESENATĂ ═══════════════════════════════ */
/* Era tot negru, colțuri drepte, borduri groase de 2px — arăta vechi.
   Caracterul tehnic rămâne (tipografie condensată, etichete majuscule,
   contrast puternic la titluri), dar pe suprafețe deschise. */

/* Bandă subțire de accent în capul fiecărui card: semnătura vizuală */
.car--c.car,.svc--row{position:relative}
.hdr--c .hdr-strip{font-weight:700;letter-spacing:.04em}

/* Etichetele de specificații, majuscule mici — limbaj de fișă tehnică */
.car--c .car-specs{
  font-size:.74rem;letter-spacing:.05em;text-transform:uppercase;
  font-weight:600;
}
.car--c .car-title{font-size:.96rem;letter-spacing:-.005em}
.car--c .car-price{font-size:1.2rem;letter-spacing:-.02em}

/* Card cu linie de accent sus, vizibilă la hover */
.car--c::before{
  content:'';position:absolute;top:0;left:0;right:0;height:3px;
  background:var(--accent);transform:scaleX(0);transform-origin:left;
  transition:transform var(--t-base) var(--ease);z-index:1;
}
.car--c:hover::before{transform:scaleX(1)}

/* ══ ANIMAȚIA BANNERULUI ═════════════════════════════════════════════════ */
/* Clasele .hero--anim-* sunt definite în styles.js. Aici doar nota:
   presetarea Compact (#2) primește 'none' deliberat — are hero-ul cel mai
   scurt, cu un rând de cifre dedesubt, iar mișcarea ar distrage de la ele. */
`;

export default { VARIANTS_CSS };