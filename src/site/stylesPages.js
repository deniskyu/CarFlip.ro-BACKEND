// ============================================================================
//  src/site/stylesPages.js
// ----------------------------------------------------------------------------
//  Stilurile paginilor interioare. Fișier separat de `styles.js` ca să nu fie
//  nevoie să rescrii 700 de linii existente — ruta le concatenează și le
//  servește ca un singur fișier cacheabil.
//
//  Aceleași principii: mobile-first, `clamp()` pentru tipografie, zero layout
//  shift, animații care nu întârzie conținutul.
// ============================================================================

export const PAGES_CSS = `
/* ── Breadcrumb ──────────────────────────────────────────────────────────── */
.crumbs{display:flex;flex-wrap:wrap;gap:.3rem .5rem;align-items:center;
  font-size:.83rem;color:var(--muted);padding-block:1rem}
.crumbs a{transition:color var(--t-fast) var(--ease)}
.crumbs a:hover{color:var(--accent)}
.crumbs li{display:flex;align-items:center;gap:.5rem}
.crumbs li+li::before{content:'/';opacity:.4}
.crumbs [aria-current]{color:var(--text);font-weight:600}

/* ── Cap de pagină interioară ────────────────────────────────────────────── */
.page-head{padding-block:clamp(1.2rem,.9rem + 1.2vw,2.2rem)}
.page-head h1{margin-bottom:.6rem}
.page-head .lead{margin-top:.4rem}
.result-count{color:var(--muted);font-size:.92rem;font-weight:600}

/* ── Filtre ──────────────────────────────────────────────────────────────── */
.filters{background:var(--surface);border:var(--border-w) solid var(--border);
  border-radius:var(--radius);padding:clamp(1rem,.8rem + .6vw,1.4rem);margin-bottom:1.6rem}
.filters-grid{display:grid;gap:.85rem;grid-template-columns:1fr}
@media(min-width:600px){.filters-grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1000px){.filters-grid{grid-template-columns:repeat(4,1fr)}}
.f-field{display:flex;flex-direction:column;gap:.35rem;min-width:0}
.f-field label{font-size:.76rem;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:var(--muted)}
.f-field select,.f-field input{
  width:100%;padding:.7rem .8rem;min-height:44px;
  border:var(--border-w) solid var(--border);border-radius:var(--radius-sm);
  background:var(--bg);color:var(--text);font-size:.94rem;
  transition:border-color var(--t-fast) var(--ease);
}
.f-field select:focus,.f-field input:focus{outline:none;border-color:var(--accent)}
.f-pair{display:flex;gap:.5rem}
.f-pair input{flex:1;min-width:0}
.filters-actions{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1rem;align-items:center}
.filters-actions .btn{flex:1;min-width:140px}
@media(min-width:600px){.filters-actions .btn{flex:0 0 auto}}

.f-error{
  margin-top:.9rem;padding:.7rem .9rem;border-radius:var(--radius-sm);
  background:#fef2f2;border:1px solid #fecaca;color:#991b1b;
  font-size:.87rem;line-height:1.5;
}
.f-field select:disabled{opacity:.55;cursor:not-allowed}

.active-filters{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1.2rem}
.af{display:inline-flex;align-items:center;gap:.45rem;padding:.4rem .75rem;
  border-radius:100px;background:var(--accent-soft);color:var(--accent);
  border:1px solid var(--accent-line);font-size:.83rem;font-weight:600}
.af b{font-weight:800}
.af-x{display:inline-flex;opacity:.7;font-size:1rem;line-height:1}
.af-x:hover{opacity:1}

/* ── Paginare ────────────────────────────────────────────────────────────── */
.pager{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;
  gap:.4rem;margin-top:clamp(2rem,1.6rem + 1.2vw,3rem)}
.pager a,.pager span{display:inline-flex;align-items:center;justify-content:center;
  min-width:44px;min-height:44px;padding:0 .75rem;border-radius:var(--radius-sm);
  border:var(--border-w) solid var(--border);font-weight:600;font-size:.92rem;
  transition:border-color var(--t-fast) var(--ease),background var(--t-fast) var(--ease)}
.pager a:hover{border-color:var(--accent);color:var(--accent)}
.pager [aria-current]{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
.pager .gap{border:none;min-width:24px;opacity:.5}
.pager .off{opacity:.35;pointer-events:none}

/* ── Pagina mașinii ──────────────────────────────────────────────────────── */
/* Spațiu sub coloane: fără el, cardul „Vizionare" se lipea de footer când
   parcul nu mai avea alte anunțuri de arătat dedesubt. */
.car-layout{display:grid;gap:clamp(1.4rem,1rem + 2vw,2.6rem);grid-template-columns:1fr;
  padding-bottom:clamp(2rem,1.5rem + 2vw,3.5rem)}
@media(min-width:960px){.car-layout{grid-template-columns:minmax(0,1.55fr) minmax(300px,1fr);
  align-items:start}}

/* Carusel cu scroll-snap: derulare nativă, fără JavaScript. */
.gal{position:relative}
.gal-main{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;
  gap:.5rem;border-radius:var(--radius);scrollbar-width:none;
  -webkit-overflow-scrolling:touch}
.gal-main::-webkit-scrollbar{display:none}
.gal-slide{flex:0 0 100%;scroll-snap-align:center;position:relative;
  aspect-ratio:4/3;background:var(--border);border-radius:var(--radius);overflow:hidden}
.gal-slide img,.gal-slide video{width:100%;height:100%;object-fit:cover;cursor:zoom-in}
.gal-slide video{cursor:default}
.gal-count{position:absolute;right:.7rem;top:.7rem;padding:.3rem .7rem;
  border-radius:100px;background:rgba(0,0,0,.62);color:#fff;font-size:.78rem;font-weight:700}
.gal-thumbs{display:flex;gap:.5rem;overflow-x:auto;margin-top:.6rem;
  padding-bottom:.3rem;scrollbar-width:thin}
.gal-thumb{flex:0 0 84px;aspect-ratio:4/3;border-radius:var(--radius-sm);
  overflow:hidden;border:2px solid transparent;background:var(--border);
  transition:border-color var(--t-fast) var(--ease)}
.gal-thumb img{width:100%;height:100%;object-fit:cover}
.gal-thumb:hover{border-color:var(--accent)}

/* Lightbox: pistă cu scroll-snap, fără niciun handler de touch.
   Varianta veche intercepta swipe-ul și dublu-tap-ul, ceea ce se bătea cu
   pinch-ul nativ — începeai să dai zoom și sărea la fotografia alăturată. */
.lb{border:none;padding:0;width:100vw;height:100dvh;max-width:100vw;max-height:100dvh;
  background:rgba(8,8,10,.97);overflow:hidden}
.lb::backdrop{background:rgba(8,8,10,.92)}
.lb-track{
  display:flex;height:100%;width:100%;
  overflow-x:auto;overflow-y:hidden;
  scroll-snap-type:x mandatory;
  scrollbar-width:none;-webkit-overflow-scrolling:touch;
}
.lb-track::-webkit-scrollbar{display:none}
.lb-slide{
  flex:0 0 100%;height:100%;scroll-snap-align:center;
  display:flex;align-items:center;justify-content:center;
  padding:1rem;
}
.lb-slide img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}
.lb-close,.lb-nav{position:fixed;z-index:2;display:inline-flex;align-items:center;
  justify-content:center;width:48px;height:48px;border-radius:50%;
  background:rgba(255,255,255,.16);color:#fff;backdrop-filter:blur(6px);
  transition:background .15s ease,transform .15s ease}
.lb-close:hover,.lb-nav:hover{background:rgba(255,255,255,.28)}
.lb-close:active,.lb-nav:active{transform:scale(.94)}
.lb-close{top:1rem;right:1rem}
.lb-prev{left:1rem;top:50%;transform:translateY(-50%)}
.lb-next{right:1rem;top:50%;transform:translateY(-50%)}
.lb-prev:active,.lb-next:active{transform:translateY(-50%) scale(.94)}
/* Săgețile sunt pentru mouse. Pe telefon derulezi cu degetul, iar butoanele
   ar acoperi fotografia. */
@media(max-width:699px){.lb-nav{display:none}}
.lb-count{position:fixed;bottom:1.2rem;left:50%;transform:translateX(-50%);
  padding:.4rem .9rem;border-radius:100px;background:rgba(255,255,255,.16);
  color:#fff;font-size:.85rem;font-weight:700;backdrop-filter:blur(6px)}

.gal-thumb-v{display:flex;align-items:center;justify-content:center;
  height:100%;color:#fff;font-size:20px;background:#3f3f46}

/* Panoul lateral cu preț și contact */
.car-aside{position:sticky;top:84px;display:flex;flex-direction:column;gap:1rem}
@media(max-width:959px){.car-aside{position:static}}
.price-card{background:var(--surface);border:var(--border-w) solid var(--border);
  border-radius:var(--radius);padding:clamp(1.1rem,.9rem + .8vw,1.6rem)}
.price-big{font-family:var(--font-display);font-weight:var(--display-weight);
  font-size:clamp(1.9rem,1.5rem + 1.6vw,2.6rem);color:var(--accent);line-height:1.05;
  letter-spacing:var(--display-tracking)}
.price-note{color:var(--muted);font-size:.88rem;margin-top:.25rem}
.price-actions{display:flex;flex-direction:column;gap:.6rem;margin-top:1.1rem}
.price-actions .btn{width:100%}
.price-phone{display:flex;align-items:center;justify-content:center;gap:.5rem;
  font-weight:800;font-size:1.05rem;padding:.8rem;border-radius:calc(var(--radius) * .8);
  border:var(--border-w) solid var(--border);min-height:46px}
.price-phone:hover{border-color:var(--accent);color:var(--accent)}
.badge-row{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:1rem}
.badge{padding:.3rem .65rem;border-radius:100px;background:var(--bg);
  border:1px solid var(--border);font-size:.76rem;font-weight:600;color:var(--muted)}
.badge--warn{background:#fff4e5;border-color:#f0c48a;color:#8a5200}

/* Specificații */
.specs{display:grid;gap:0;grid-template-columns:1fr;
  border:var(--border-w) solid var(--border);border-radius:var(--radius);overflow:hidden}
@media(min-width:560px){.specs{grid-template-columns:repeat(2,1fr)}}
.spec{display:flex;justify-content:space-between;gap:1rem;padding:.8rem 1rem;
  border-bottom:1px solid var(--border);font-size:.92rem}
.spec:nth-child(even){background:var(--surface)}
@media(min-width:560px){
  /* Pe două coloane, dungile alternează pe RÂNDURI, nu pe celule: perechile
     3-4, 7-8 etc. Regula de resetare trebuie să vină prima, altfel anulează
     tocmai regula pe care o adaugă dedesubt. */
  .spec:nth-child(even){background:none}
  .spec:nth-child(4n-1),.spec:nth-child(4n){background:var(--surface)}
  .spec:nth-child(odd){border-right:1px solid var(--border)}
}
.spec dt{color:var(--muted)}
.spec dd{font-weight:700;text-align:right}

.prose{max-width:68ch;font-size:1rem;line-height:1.75;color:var(--text)}
.prose p{margin-bottom:1rem;white-space:pre-line}
.prose h2,.prose h3{margin:2rem 0 .8rem}
.prose ul{list-style:disc;padding-left:1.3rem;margin-bottom:1rem}
.prose li{margin-bottom:.4rem}
.prose a{color:var(--accent);text-decoration:underline}
.prose strong{font-weight:700}

/* ── Contact ─────────────────────────────────────────────────────────────── */
.contact-grid{display:grid;gap:clamp(1.4rem,1rem + 2vw,2.6rem);grid-template-columns:1fr}
@media(min-width:900px){.contact-grid{grid-template-columns:minmax(0,1fr) minmax(0,1.15fr)}}
.info-list{display:flex;flex-direction:column;gap:.9rem}
.info-row{display:flex;gap:.85rem;align-items:flex-start}
.info-ico{display:inline-flex;align-items:center;justify-content:center;
  width:40px;height:40px;flex-shrink:0;border-radius:calc(var(--radius) * .7);
  background:var(--accent-soft);color:var(--accent)}
.info-row strong{display:block;font-size:.78rem;letter-spacing:.08em;
  text-transform:uppercase;color:var(--muted);margin-bottom:.15rem;font-weight:700}
.info-row a,.info-row span{font-size:1rem;font-weight:600}
.info-row a:hover{color:var(--accent)}

.hours{border:var(--border-w) solid var(--border);border-radius:var(--radius);overflow:hidden}
.hours-row{display:flex;justify-content:space-between;padding:.7rem 1rem;
  border-bottom:1px solid var(--border);font-size:.93rem}
.hours-row:last-child{border-bottom:none}
.hours-row.is-today{background:var(--accent-soft);color:var(--accent);font-weight:700}
.hours-row.is-closed{color:var(--muted)}

.map-wrap{position:relative;aspect-ratio:4/3;border-radius:var(--radius);
  overflow:hidden;border:var(--border-w) solid var(--border);background:var(--surface)}
@media(min-width:900px){.map-wrap{aspect-ratio:1/1}}
.map-wrap iframe{width:100%;height:100%;border:0;display:block}

/* ── 404 în interiorul site-ului ─────────────────────────────────────────── */
.nf{padding-block:clamp(3rem,2rem + 4vw,6rem);text-align:center}
.nf-code{font-family:var(--font-display);font-size:clamp(3.5rem,2.5rem + 6vw,7rem);
  font-weight:var(--display-weight);color:var(--accent-line);line-height:1;
  letter-spacing:var(--display-tracking)}
.nf h1{margin:.5rem 0 .8rem}
.nf .lead{margin-inline:auto}
.nf .hero-actions{justify-content:center;margin-top:1.8rem}
`;

export default { PAGES_CSS };
