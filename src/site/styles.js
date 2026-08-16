// ============================================================================
//  src/site/styles.js
// ----------------------------------------------------------------------------
//  Foaia de stil a tuturor site-urilor. Un singur fișier, servit cacheabil de
//  la /assets/site.<versiune>.css — identic pentru toate parcurile. Ce diferă
//  sunt variabilele CSS injectate în <head> (vezi theme.js).
//
//  ── PRINCIPII ─────────────────────────────────────────────────────────────
//  MOBILE-FIRST. Toate `@media` sunt `min-width`. Stilul de bază e cel de
//  telefon, unde vine majoritatea traficului pe un site de mașini.
//
//  TIPOGRAFIE FLUIDĂ cu `clamp()`. Fără salturi bruște la breakpoint și fără
//  scări separate per dimensiune de ecran.
//
//  ZERO LAYOUT SHIFT. Fiecare imagine primește `width`/`height` din baza de
//  date (le scrie mediaWorker) plus `aspect-ratio` în CSS. Spațiul e rezervat
//  înainte ca poza să se încarce — de asta depinde direct scorul CLS.
//
//  ANIMAȚIILE NU ÎNTÂRZIE CONȚINUTUL. Nu există `opacity: 0` inițial pe nimic
//  esențial. Conținutul e vizibil din prima pictură; animația doar îl
//  însoțește. Altfel Google vede o pagină care se mișcă și scade scorul.
//
//  `prefers-reduced-motion` dezactivează tot, la final.
// ============================================================================

export const CSS_VERSION = 'v3';

export const SITE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body,h1,h2,h3,h4,p,figure,blockquote,dl,dd,ul,ol{margin:0}
ul[class],ol[class]{list-style:none;padding:0}
img,picture,video,svg{display:block;max-width:100%}
input,button,textarea,select{font:inherit;color:inherit}
button{cursor:pointer;background:none;border:none;padding:0}
a{color:inherit;text-decoration:none}

body{
  background:var(--bg);color:var(--text);
  font-family:var(--font-body);
  font-size:16px;line-height:1.6;
  -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
}

/* Spațiul pentru butonul sticky stă ÎN FOOTER, nu pe body.
   Pe body producea o fâșie sub footer care arăta culoarea paginii (albă pe
   presetările deschise) — se vedea ca o bandă goală sub subsolul închis la
   culoare. În footer, spațiul are aceeași culoare cu el și dispare vizual. */
.site-footer{
  padding-bottom:calc(clamp(2.4rem,1.8rem + 2.4vw,3.6rem) + 64px + env(safe-area-inset-bottom,0px));
}
@media(min-width:900px){
  .site-footer{ padding-bottom:clamp(2.4rem,1.8rem + 2.4vw,3.6rem); }
}

h1,h2,h3,.display{
  font-family:var(--font-display);
  font-weight:var(--display-weight);
  letter-spacing:var(--display-tracking);
  line-height:1.12;
}
h1{font-size:clamp(1.85rem,1.15rem + 3.1vw,3.4rem)}
h2{font-size:clamp(1.45rem,1.05rem + 1.7vw,2.3rem)}
h3{font-size:clamp(1.1rem,.98rem + .55vw,1.4rem)}

.wrap{width:min(1180px,100% - 2rem);margin-inline:auto}
@media(min-width:768px){.wrap{width:min(1180px,100% - 3rem)}}
.section{padding-block:clamp(2.6rem,1.6rem + 4vw,5rem)}
.section--tint{background:var(--surface)}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0 0 0 0);white-space:nowrap;border:0}

.eyebrow{
  font-size:.76rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
  color:var(--accent);margin-bottom:.6rem;
}
.lead{color:var(--muted);font-size:clamp(.98rem,.94rem + .2vw,1.1rem);max-width:62ch}
.section-head{margin-bottom:clamp(1.4rem,1rem + 1.4vw,2.4rem)}

/* ── Butoane ─────────────────────────────────────────────────────────────── */
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:.55rem;
  padding:.85rem 1.5rem;border-radius:calc(var(--radius) * .8);
  font-weight:700;font-size:.95rem;text-align:center;
  border:var(--border-w) solid transparent;
  transition:transform var(--t-fast) var(--ease),background var(--t-fast) var(--ease),
             border-color var(--t-fast) var(--ease),box-shadow var(--t-fast) var(--ease);
  /* Ținta minimă de atingere recomandată — degetul mare pe telefon. */
  min-height:46px;
}
.btn:active{transform:scale(.975)}
.btn--primary{background:var(--accent);color:var(--on-accent)}
.btn--primary:hover{background:var(--accent-dark)}
.btn--ghost{border-color:var(--border);color:var(--text)}
.btn--ghost:hover{border-color:var(--accent);color:var(--accent)}
.btn--on-dark{background:#fff;color:#111}
.btn--outline-light{border-color:rgba(255,255,255,.55);color:#fff}
.btn--outline-light:hover{background:rgba(255,255,255,.12)}
.btn--wide{width:100%}
@media(min-width:560px){.btn--wide{width:auto}}
.btn svg{flex-shrink:0}

/* ── Header ──────────────────────────────────────────────────────────────── */
.site-header{
  position:sticky;top:0;z-index:50;
  background:var(--header-bg);color:var(--header-text);
  border-bottom:var(--border-w) solid var(--border);
  backdrop-filter:saturate(180%) blur(12px);
}
.header-inner{display:flex;align-items:center;gap:1rem;min-height:66px}
.brand{display:flex;align-items:center;gap:.7rem;flex:1;min-width:0}
.brand-logo{
  width:42px;height:42px;flex-shrink:0;border-radius:50%;
  background:#fff;object-fit:contain;padding:3px;
  border:1px solid var(--border);
}
.brand-name{font-family:var(--font-display);font-weight:var(--display-weight);
  font-size:1.02rem;line-height:1.15;letter-spacing:var(--display-tracking);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.brand-city{display:block;font-family:var(--font-body);font-weight:400;
  font-size:.72rem;letter-spacing:.04em;opacity:.62;text-transform:uppercase}

.nav{display:none}
@media(min-width:900px){
  .nav{display:flex;gap:.35rem;align-items:center}
  .nav a{padding:.55rem .9rem;border-radius:var(--radius-sm);font-size:.94rem;font-weight:600;
    transition:background var(--t-fast) var(--ease),color var(--t-fast) var(--ease)}
  .nav a:hover{background:var(--accent-soft);color:var(--accent)}
  .nav a[aria-current]{color:var(--accent)}
}
.header-cta{display:flex;align-items:center;gap:.5rem;flex-shrink:0}
.header-phone{
  display:inline-flex;align-items:center;gap:.5rem;
  padding:.6rem .95rem;border-radius:calc(var(--radius) * .8);
  background:var(--accent);color:var(--on-accent);
  font-weight:700;font-size:.9rem;min-height:42px;
}
.header-phone span{display:none}
@media(min-width:560px){.header-phone span{display:inline}}

/* Meniu mobil fără JavaScript: checkbox ascuns + selector de vecin. */
.nav-toggle{display:none}
.nav-btn{display:inline-flex;align-items:center;justify-content:center;
  width:42px;height:42px;border-radius:var(--radius-sm);border:var(--border-w) solid var(--border)}
@media(min-width:900px){.nav-btn{display:none}}
.nav-mobile{display:none;padding:.5rem 0 1rem;border-top:var(--border-w) solid var(--border)}
.nav-toggle:checked ~ .nav-mobile{display:block}
.nav-mobile a{display:block;padding:.85rem .25rem;font-weight:600;
  border-bottom:1px solid var(--border)}
.nav-mobile a:last-child{border-bottom:none}
@media(min-width:900px){.nav-mobile{display:none!important}}

/* ── Hero ────────────────────────────────────────────────────────────────── */
.hero{position:relative;min-height:var(--hero-min-h);display:flex;align-items:flex-end;
  color:#fff;overflow:hidden;isolation:isolate}
.hero-media{position:absolute;inset:0;z-index:-2}
.hero-media img{width:100%;height:100%;object-fit:cover;object-position:center}
/* Gradient întunecat AUTOMAT, neconfigurabil. Rezolvă definitiv problema
   „text alb pe cer alb", indiferent ce banner urcă dealerul. */
/* Pe mobil, gradientul e cu câteva procente mai închis. Bannerele făcute cu
   telefonul sunt afișate la lățime mare pe un ecran mic și dens, iar lipsa de
   claritate se vede mai puțin pe un fundal mai închis. Diferența e subtilă
   intenționat — nu compensează o poză de rezoluție mică, doar o îmblânzește. */
.hero-scrim{position:absolute;inset:0;z-index:-1;
  background:linear-gradient(180deg,rgba(0,0,0,.38) 0%,rgba(0,0,0,.24) 38%,rgba(0,0,0,.86) 100%)}
@media(min-width:900px){
  .hero-scrim{background:
    linear-gradient(90deg,rgba(0,0,0,.80) 0%,rgba(0,0,0,.46) 48%,rgba(0,0,0,.12) 100%),
    linear-gradient(180deg,rgba(0,0,0,.28) 0%,rgba(0,0,0,0) 40%)}
}
.hero-inner{padding-block:clamp(2.2rem,1.4rem + 4vw,5rem);max-width:44rem}
.hero h1{color:#fff;text-shadow:0 2px 24px rgba(0,0,0,.35)}
.hero-sub{margin-top:.9rem;font-size:clamp(1rem,.95rem + .3vw,1.18rem);
  color:rgba(255,255,255,.92);max-width:40rem}
.hero-count{
  display:inline-flex;align-items:center;gap:.5rem;margin-top:1.1rem;
  padding:.5rem .95rem;border-radius:100px;
  background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.24);
  font-size:.9rem;font-weight:700;backdrop-filter:blur(6px);
}
.hero-count b{color:#fff}
.hero-actions{display:flex;flex-wrap:wrap;gap:.7rem;margin-top:1.5rem}
.hero--center .hero-inner{max-width:52rem;margin-inline:auto;text-align:center}
.hero--center .hero-actions{justify-content:center}
.hero--center .hero-sub{margin-inline:auto}

/* ── Grilă de mașini ─────────────────────────────────────────────────────── */
.car-grid{display:grid;gap:clamp(.9rem,.7rem + .8vw,1.4rem);grid-template-columns:1fr}
@media(min-width:560px){.car-grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:960px){.car-grid{grid-template-columns:repeat(3,1fr)}}

.car{
  display:flex;flex-direction:column;height:100%;
  background:var(--surface);border:var(--border-w) solid var(--border);
  border-radius:var(--radius);overflow:hidden;
  transition:transform var(--t-base) var(--ease),box-shadow var(--t-base) var(--ease),
             border-color var(--t-base) var(--ease);
}
.car:hover{transform:translateY(var(--lift));box-shadow:var(--shadow);border-color:var(--accent-line)}
.car-media{position:relative;display:block;aspect-ratio:4/3;background:var(--border);overflow:hidden}
.car-media img{width:100%;height:100%;object-fit:cover;
  transition:transform var(--t-slow) var(--ease)}
.car:hover .car-media img{transform:scale(1.045)}
/* Prețul e STATIC implicit. Suprapunerea peste fotografie e cazul SPECIAL,
   activat doar de varianta 'a' (vezi stylesVariants.js).
   Invers — absolut implicit, cu resetare în fiecare variantă — a produs deja
   un bug: prețul rămânea absolut și ateriza peste butonul de WhatsApp la toate
   presetările care nu-l suprapun. O regulă uitată nu mai poate face asta. */
.car-price{
  padding:.45rem .8rem;border-radius:calc(var(--radius) * .55);
  background:var(--accent);color:var(--on-accent);
  font-weight:800;font-size:1rem;letter-spacing:-.01em;
}
.car-neg{padding:.32rem .6rem;border-radius:100px;
  background:rgba(0,0,0,.62);color:#fff;font-size:.7rem;font-weight:700}
.car-body{padding:.95rem 1rem 1.05rem;display:flex;flex-direction:column;gap:.6rem;flex:1}
.car-title{font-size:1.02rem;font-weight:700;line-height:1.3;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.car-specs{display:flex;flex-wrap:wrap;gap:.3rem .5rem;color:var(--muted);font-size:.83rem}
.car-specs li{display:flex;align-items:center;gap:.3rem}
.car-specs li+li::before{content:'';width:3px;height:3px;border-radius:50%;
  background:currentColor;opacity:.5;margin-right:.2rem}
.car-foot{margin-top:auto;padding-top:.3rem}
.car-wa{
  display:flex;align-items:center;justify-content:center;gap:.5rem;width:100%;
  padding:.7rem;border-radius:calc(var(--radius) * .7);
  border:var(--border-w) solid var(--accent-line);color:var(--accent);
  font-weight:700;font-size:.88rem;min-height:44px;
  transition:background var(--t-fast) var(--ease),color var(--t-fast) var(--ease);
}
.car-wa:hover{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}


/* ── Servicii ────────────────────────────────────────────────────────────── */
.svc-grid{display:grid;gap:clamp(.9rem,.7rem + .8vw,1.5rem);grid-template-columns:1fr}
@media(min-width:700px){.svc-grid{grid-template-columns:repeat(3,1fr)}}
.svc{
  padding:clamp(1.2rem,1rem + .8vw,1.8rem);
  background:var(--bg);border:var(--border-w) solid var(--border);
  border-radius:var(--radius);
  transition:border-color var(--t-base) var(--ease),transform var(--t-base) var(--ease);
}
.svc:hover{border-color:var(--accent-line);transform:translateY(var(--lift))}
.svc-icon{
  display:inline-flex;align-items:center;justify-content:center;
  width:46px;height:46px;border-radius:calc(var(--radius) * .75);
  background:var(--accent-soft);color:var(--accent);margin-bottom:1rem;
}
.svc h3{margin-bottom:.5rem}
.svc p{color:var(--muted);font-size:.94rem}
/* Variantă orizontală (presetările dense) */
.svc--row{display:flex;gap:1rem;align-items:flex-start}
.svc--row .svc-icon{margin-bottom:0;width:40px;height:40px}
/* Variantă numerotată (Editorial) */
.svc--num .svc-icon{display:none}
.svc--num .svc-no{display:block;font-family:var(--font-display);font-size:2.2rem;
  font-weight:var(--display-weight);color:var(--accent-line);line-height:1;margin-bottom:.6rem}

/* ── Bandă de contact ────────────────────────────────────────────────────── */
.cta-band{background:var(--accent);color:var(--on-accent);
  padding-block:clamp(2.2rem,1.6rem + 2.4vw,3.6rem)}
.cta-band h2{color:var(--on-accent)}
.cta-band p{opacity:.9;margin-top:.55rem}
.cta-inner{display:flex;flex-direction:column;gap:1.4rem;align-items:flex-start}
@media(min-width:820px){
  .cta-inner{flex-direction:row;align-items:center;justify-content:space-between}
  .cta-actions{flex-shrink:0}
}
.cta-actions{display:flex;flex-wrap:wrap;gap:.7rem}
.cta-phone{display:inline-flex;align-items:center;gap:.5rem;font-weight:800;
  font-size:1.15rem;padding:.85rem 1.5rem;border-radius:calc(var(--radius) * .8);
  background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);min-height:46px}

/* ── Footer ──────────────────────────────────────────────────────────────── */
.site-footer{background:var(--footer-bg);color:var(--footer-text);
  padding-block:clamp(2.4rem,1.8rem + 2.4vw,3.6rem)}
.footer-grid{display:grid;gap:2rem;grid-template-columns:1fr}
@media(min-width:700px){.footer-grid{grid-template-columns:1.4fr 1fr 1fr}}
.footer-brand{display:flex;align-items:center;gap:.75rem;margin-bottom:.9rem}
.footer-brand img{width:44px;height:44px;border-radius:50%;background:#fff;
  object-fit:contain;padding:3px}
.footer-brand strong{font-family:var(--font-display);font-size:1.05rem;color:#fff}
.site-footer h4{font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;
  opacity:.6;margin-bottom:.85rem;font-weight:700}
.footer-list li{margin-bottom:.55rem;font-size:.93rem}
.footer-list a{opacity:.85;transition:opacity var(--t-fast) var(--ease)}
.footer-list a:hover{opacity:1;text-decoration:underline}
.footer-hours{display:flex;justify-content:space-between;gap:1rem;
  font-size:.88rem;margin-bottom:.4rem;opacity:.85}
.footer-hours.is-closed{opacity:.45}
.footer-social{display:flex;gap:.5rem;margin-top:1rem}
.footer-social a{display:inline-flex;align-items:center;justify-content:center;
  width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.22);
  transition:background var(--t-fast) var(--ease)}
.footer-social a:hover{background:rgba(255,255,255,.12)}

.footer-legal{margin-top:2.2rem;padding-top:1.4rem;
  border-top:1px solid rgba(255,255,255,.14);
  display:flex;flex-direction:column;gap:.9rem}
.footer-firm{font-size:.76rem;opacity:.55;line-height:1.7}
.footer-links{display:flex;flex-wrap:wrap;gap:.4rem 1rem;font-size:.8rem;opacity:.7}
.footer-links a:hover{text-decoration:underline}
.footer-made{display:flex;flex-wrap:wrap;align-items:center;gap:.7rem;
  font-size:.8rem;opacity:.6;margin-top:.4rem}
.footer-made a{font-weight:700;opacity:.95}
.store-badges{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1rem}
.store-badge{display:inline-flex;align-items:center;gap:.55rem;
  padding:.55rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.24);
  font-size:.78rem;line-height:1.15;transition:background var(--t-fast) var(--ease)}
.store-badge:hover{background:rgba(255,255,255,.1)}
.store-badge b{display:block;font-size:.92rem}
.store-badge span{opacity:.7}

/* ── Bara sticky de contact ──────────────────────────────────────────────── */
.sticky-wa{
  position:fixed;z-index:60;right:1rem;
  bottom:calc(1rem + env(safe-area-inset-bottom,0px));
  display:inline-flex;align-items:center;gap:.55rem;
  padding:.85rem 1.25rem;border-radius:100px;
  background:#25D366;color:#052e16;font-weight:800;font-size:.94rem;
  box-shadow:0 8px 28px rgba(0,0,0,.28);
  transition:transform var(--t-fast) var(--ease);
}
.sticky-wa:active{transform:scale(.96)}
.sticky-wa--circle{padding:0;width:56px;height:56px;justify-content:center}
.sticky-wa--circle span{display:none}
.sticky-wa--bar{
  left:0;right:0;bottom:0;border-radius:0;justify-content:center;
  padding:.95rem 1rem calc(.95rem + env(safe-area-inset-bottom,0px));
  box-shadow:0 -4px 24px rgba(0,0,0,.18);
}
@media(min-width:900px){
  .sticky-wa--bar{left:auto;right:1.5rem;bottom:1.5rem;border-radius:100px;
    padding:.85rem 1.25rem;box-shadow:0 8px 28px rgba(0,0,0,.28)}
}

/* ── Animație la scroll ──────────────────────────────────────────────────── */
/* Conținutul e vizibil din start; animația doar îl însoțește. Fără JavaScript,
   fără 'opacity:0' inițial pe elemente esențiale. */
@supports (animation-timeline: view()){
  @media(prefers-reduced-motion:no-preference) and (min-width:700px){
    .reveal{animation:reveal-in linear both;animation-timeline:view();
      animation-range:entry 8% cover 26%}
    @keyframes reveal-in{
      from{opacity:.25;transform:translateY(16px)}
      to{opacity:1;transform:none}
    }
  }
}

/* ── Utilitare ───────────────────────────────────────────────────────────── */
.stack-sm > * + *{margin-top:.5rem}
.stack > * + *{margin-top:1rem}
.center{text-align:center}
.muted{color:var(--muted)}
.grid-head{display:flex;flex-wrap:wrap;gap:1rem;align-items:flex-end;
  justify-content:space-between;margin-bottom:1.5rem}
.chip-row{display:flex;flex-wrap:wrap;gap:.5rem}
.chip{display:inline-flex;align-items:center;gap:.4rem;padding:.5rem .9rem;
  border-radius:100px;border:var(--border-w) solid var(--border);
  font-size:.87rem;font-weight:600;
  transition:border-color var(--t-fast) var(--ease),color var(--t-fast) var(--ease)}
.chip:hover{border-color:var(--accent);color:var(--accent)}
.chip b{color:var(--muted);font-weight:600}
.empty-state{padding:3rem 1rem;text-align:center;color:var(--muted);
  border:1px dashed var(--border);border-radius:var(--radius)}

/* ── Respectă preferința de mișcare redusă ───────────────────────────────── */
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{
    animation-duration:.01ms!important;animation-iteration-count:1!important;
    transition-duration:.01ms!important;scroll-behavior:auto!important;
  }
}

@media print{
  .site-header,.sticky-wa,.hero-scrim,.cta-band{display:none!important}
  body{padding-bottom:0}
}
`;

export default { SITE_CSS, CSS_VERSION };