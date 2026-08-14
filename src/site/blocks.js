import { html, raw } from './html.js';
import { ICONS } from './components.js';

// ============================================================================
//  src/site/blocks.js
// ----------------------------------------------------------------------------
//  Blocurile folosite de paginile interioare. Ca și componentele din
//  `components.js`, sunt funcții pure — date în, markup afară.
// ============================================================================

const DAY_NAMES = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Construiește un query string păstrând filtrele curente și suprascriind câteva. */
export const qs = (base, overrides = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...base, ...overrides })) {
        if (v === undefined || v === null || v === '' || v === false) continue;
        p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : '';
};

// ════════════════════════════════════════════════════════════════════════════

export const Breadcrumb = (items) => html`
<nav aria-label="Breadcrumb">
  <ol class="crumbs">
    ${items.map((it, i) => html`
    <li>${i === items.length - 1
        ? html`<span aria-current="page">${it.name}</span>`
        : html`<a href="${it.path}">${it.name}</a>`}</li>`)}
  </ol>
</nav>`;

// ════════════════════════════════════════════════════════════════════════════
//  FILTRE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Formular GET simplu. Zero JavaScript: funcționează cu JS dezactivat, filtrele
 * ajung în URL, deci pagina rezultată e partajabilă și are buton „înapoi"
 * funcțional.
 *
 * Select-ul de model apare DOAR după ce s-a ales o marcă, populat server-side.
 * Fără JavaScript nu se poate popula dinamic, iar alternativa — toate modelele
 * din toate mărcile într-o listă — ar fi ilizibilă.
 *
 * Mărcile vin din stocul REAL al dealerului, cu numărul lângă. Un dropdown cu
 * 200 de mărci din care 192 dau zero rezultate nu e „complet", e inutilizabil.
 */
export const Filters = ({ filters, applied, sort, action = '/stoc' }) => {
    const brand = applied.marca
        ? filters.brands.find((b) => b.slug === applied.marca.slug)
        : null;

    return html`
<form class="filters" method="get" action="${action}">
  <div class="filters-grid">

    <div class="f-field">
      <label for="f-marca">Marcă</label>
      <select id="f-marca" name="marca">
        <option value="">Toate mărcile</option>
        ${filters.brands.map((b) => html`
        <option value="${b.slug}"${applied.marca?.slug === b.slug ? raw(' selected') : ''}>${b.name} (${b.count})</option>`)}
      </select>
    </div>

    ${brand && brand.models.length > 1 ? html`
    <div class="f-field">
      <label for="f-model">Model</label>
      <select id="f-model" name="model">
        <option value="">Toate modelele ${brand.name}</option>
        ${brand.models.map((m) => html`
        <option value="${m.slug}"${applied.model?.slug === m.slug ? raw(' selected') : ''}>${m.name} (${m.count})</option>`)}
      </select>
    </div>` : ''}

    <div class="f-field">
      <label for="f-pmin">Preț (€)</label>
      <div class="f-pair">
        <input id="f-pmin" type="number" inputmode="numeric" name="pret_min" placeholder="min"
               min="0" step="100" value="${applied.pret_min ?? ''}">
        <input type="number" inputmode="numeric" name="pret_max" placeholder="max"
               min="0" step="100" value="${applied.pret_max ?? ''}">
      </div>
    </div>

    <div class="f-field">
      <label for="f-amin">An fabricație</label>
      <div class="f-pair">
        <input id="f-amin" type="number" inputmode="numeric" name="an_min" placeholder="${filters.year?.min || 'de la'}"
               min="1950" max="2100" value="${applied.an_min ?? ''}">
        <input type="number" inputmode="numeric" name="an_max" placeholder="${filters.year?.max || 'până la'}"
               min="1950" max="2100" value="${applied.an_max ?? ''}">
      </div>
    </div>

    <div class="f-field">
      <label for="f-km">Kilometraj maxim</label>
      <input id="f-km" type="number" inputmode="numeric" name="km_max" placeholder="ex. 150000"
             min="0" step="1000" value="${applied.km_max ?? ''}">
    </div>

    ${filters.fuels?.length > 1 ? html`
    <div class="f-field">
      <label for="f-fuel">Combustibil</label>
      <select id="f-fuel" name="combustibil">
        <option value="">Oricare</option>
        ${filters.fuels.map((f) => html`
        <option value="${f}"${applied.combustibil === f ? raw(' selected') : ''}>${f}</option>`)}
      </select>
    </div>` : ''}

    <div class="f-field">
      <label for="f-sort">Sortare</label>
      <select id="f-sort" name="sort">
        <option value="nou"${sort === 'nou' ? raw(' selected') : ''}>Cele mai noi</option>
        <option value="pret_asc"${sort === 'pret_asc' ? raw(' selected') : ''}>Preț crescător</option>
        <option value="pret_desc"${sort === 'pret_desc' ? raw(' selected') : ''}>Preț descrescător</option>
        <option value="an_desc"${sort === 'an_desc' ? raw(' selected') : ''}>An descrescător</option>
        <option value="km_asc"${sort === 'km_asc' ? raw(' selected') : ''}>Kilometraj crescător</option>
      </select>
    </div>

  </div>

  <div class="filters-actions">
    <button class="btn btn--primary" type="submit">Caută</button>
    ${Object.keys(applied).length ? html`<a class="f-reset" href="${action}">Șterge filtrele</a>` : ''}
  </div>
</form>`;
};

/** Chip-uri cu filtrele active, fiecare cu link de eliminare. */
export const ActiveFilters = ({ applied, query, action = '/stoc' }) => {
    const keys = Object.keys(applied);
    if (!keys.length) return '';

    const labels = {
        marca: () => ['Marcă', applied.marca.name, { marca: null, model: null }],
        model: () => ['Model', applied.model.name, { model: null }],
        pret_min: () => ['Preț min', `${applied.pret_min} €`, { pret_min: null }],
        pret_max: () => ['Preț max', `${applied.pret_max} €`, { pret_max: null }],
        an_min: () => ['An min', applied.an_min, { an_min: null }],
        an_max: () => ['An max', applied.an_max, { an_max: null }],
        km_max: () => ['Km max', `${new Intl.NumberFormat('de-DE').format(applied.km_max)} km`, { km_max: null }],
        combustibil: () => ['Combustibil', applied.combustibil, { combustibil: null }],
    };

    return html`
<div class="active-filters">
  ${keys.filter((k) => labels[k]).map((k) => {
      const [label, value, clear] = labels[k]();
      return html`
  <span class="af">${label}: <b>${value}</b>
    <a class="af-x" href="${action}${qs(query, { ...clear, page: null })}"
       aria-label="Elimină filtrul ${label}">&times;</a>
  </span>`;
  })}
</div>`;
};

// ════════════════════════════════════════════════════════════════════════════
//  PAGINARE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Paginare clasică cu numere. Nu cursor: un cursor opac în URL nu se poate
 * partaja, nu se poate da bookmark și nu se indexează. Catalogul vrea
 * „48 de mașini, pagina 2 din 4".
 *
 * Numărul de pagini afișate e limitat, cu „…" între capete, ca să nu se rupă
 * layoutul pe mobil la 40 de pagini.
 */
export const Pagination = ({ page, pages, basePath, query }) => {
    if (pages <= 1) return '';

    const link = (n) => `${basePath}${qs(query, { page: n === 1 ? null : n })}`;
    const nums = [];
    const push = (n) => { if (!nums.includes(n) && n >= 1 && n <= pages) nums.push(n); };

    push(1);
    for (let n = page - 1; n <= page + 1; n++) push(n);
    push(pages);
    nums.sort((a, b) => a - b);

    return html`
<nav class="pager" aria-label="Paginare">
  <a class="${page <= 1 ? 'off' : ''}" href="${link(Math.max(1, page - 1))}"
     rel="prev" aria-label="Pagina anterioară">‹</a>
  ${nums.map((n, i) => html`
  ${i > 0 && n - nums[i - 1] > 1 ? html`<span class="gap">…</span>` : ''}
  ${n === page
      ? html`<span aria-current="page">${n}</span>`
      : html`<a href="${link(n)}">${n}</a>`}`)}
  <a class="${page >= pages ? 'off' : ''}" href="${link(Math.min(pages, page + 1))}"
     rel="next" aria-label="Pagina următoare">›</a>
</nav>`;
};

// ════════════════════════════════════════════════════════════════════════════
//  GALERIE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Carusel cu scroll-snap nativ + lightbox pe <dialog>.
 *
 * Navigarea principală NU are nevoie de JavaScript: derulezi cu degetul sau cu
 * trackpad-ul, snap-ul e din CSS. JavaScript-ul (~50 de linii, injectat doar pe
 * pagina de mașină) adaugă doar lightbox-ul: deschidere, săgeți, tastatură,
 * swipe și zoom la dublu-tap.
 *
 * `<dialog>` nativ aduce gratuit gestionarea tastei Escape, capturarea
 * focusului și `::backdrop`.
 *
 * Videoclipurile primesc `preload="none"`: altfel un clip de 40MB ar începe să
 * se descarce în fundal și ar strica scorul de viteză al paginii.
 */
export const Gallery = (car) => {
    const media = Array.isArray(car.media) ? car.media : [];
    if (!media.length) return '';

    return html`
<div class="gal">
  <div class="gal-main" id="gal-main">
    ${media.map((m, i) => html`
    <div class="gal-slide">
      ${m.type === 'video'
        ? html`<video controls preload="none" playsinline
                 ${m.width ? raw(`width="${m.width}"`) : ''}
                 ${m.height ? raw(`height="${m.height}"`) : ''}>
                 <source src="${m.url}" type="video/mp4"></video>`
        : html`<img src="${m.url}" alt="${m.alt}"
                 ${m.width ? raw(`width="${m.width}"`) : ''}
                 ${m.height ? raw(`height="${m.height}"`) : ''}
                 loading="${i === 0 ? 'eager' : 'lazy'}"
                 ${i === 0 ? raw('fetchpriority="high"') : raw('decoding="async"')}
                 data-lb="${i}">`}
      ${i === 0 && media.length > 1
        ? html`<span class="gal-count">1 / ${media.length}</span>` : ''}
    </div>`)}
  </div>

  ${media.length > 1 ? html`
  <div class="gal-thumbs">
    ${media.map((m, i) => html`
    <button class="gal-thumb" type="button" data-go="${i}"
            aria-label="Fotografia ${i + 1}">
      ${m.type === 'video'
        ? html`<span style="display:flex;align-items:center;justify-content:center;height:100%">▶</span>`
        : html`<img src="${m.url}" alt="" width="84" height="63" loading="lazy" decoding="async">`}
    </button>`)}
  </div>` : ''}
</div>

<dialog class="lb" id="lb">
  <div class="lb-stage" id="lb-stage"><img id="lb-img" src="" alt=""></div>
  <button class="lb-close" id="lb-close" aria-label="Închide">&times;</button>
  ${media.length > 1 ? html`
  <button class="lb-nav lb-prev" id="lb-prev" aria-label="Anterioara">‹</button>
  <button class="lb-nav lb-next" id="lb-next" aria-label="Următoarea">›</button>
  <span class="lb-count" id="lb-count"></span>` : ''}
</dialog>`;
};

/** Scriptul lightbox-ului. Injectat inline, doar pe pagina de mașină. */
export const GALLERY_JS = `
(function(){
  var main=document.getElementById('gal-main');
  var lb=document.getElementById('lb');
  if(!main||!lb||!lb.showModal)return;
  var img=document.getElementById('lb-img'),stage=document.getElementById('lb-stage');
  var count=document.getElementById('lb-count');
  var pics=[].slice.call(main.querySelectorAll('img[data-lb]'));
  if(!pics.length)return;
  var i=0;
  function show(n){
    i=(n+pics.length)%pics.length;
    img.src=pics[i].src; img.alt=pics[i].alt||'';
    stage.classList.remove('is-zoomed');
    if(count)count.textContent=(i+1)+' / '+pics.length;
  }
  function open(n){show(n);lb.showModal();document.body.style.overflow='hidden';}
  function close(){lb.close();document.body.style.overflow='';}
  pics.forEach(function(p,n){p.addEventListener('click',function(){open(n);});});
  [].slice.call(document.querySelectorAll('[data-go]')).forEach(function(b){
    b.addEventListener('click',function(){
      var n=+b.dataset.go, s=main.children[n];
      if(s)main.scrollTo({left:s.offsetLeft-main.offsetLeft,behavior:'smooth'});
    });
  });
  var c=document.getElementById('lb-close'); if(c)c.addEventListener('click',close);
  var p=document.getElementById('lb-prev'); if(p)p.addEventListener('click',function(){show(i-1);});
  var n=document.getElementById('lb-next'); if(n)n.addEventListener('click',function(){show(i+1);});
  lb.addEventListener('close',function(){document.body.style.overflow='';});
  lb.addEventListener('click',function(e){if(e.target===lb||e.target===stage)close();});
  document.addEventListener('keydown',function(e){
    if(!lb.open)return;
    if(e.key==='ArrowLeft')show(i-1);
    if(e.key==='ArrowRight')show(i+1);
  });
  // Dublu-tap / dublu-clic pentru zoom, peste pinch-ul nativ al browserului.
  img.addEventListener('dblclick',function(){stage.classList.toggle('is-zoomed');});
  var last=0;
  img.addEventListener('touchend',function(e){
    var t=Date.now(); if(t-last<300){stage.classList.toggle('is-zoomed');e.preventDefault();} last=t;
  });
  // Swipe orizontal în lightbox.
  var x0=null;
  stage.addEventListener('touchstart',function(e){x0=e.touches[0].clientX;},{passive:true});
  stage.addEventListener('touchend',function(e){
    if(x0===null||stage.classList.contains('is-zoomed'))return;
    var dx=e.changedTouches[0].clientX-x0;
    if(Math.abs(dx)>60)show(dx<0?i+1:i-1);
    x0=null;
  },{passive:true});
})();`;

// ════════════════════════════════════════════════════════════════════════════
//  SPECIFICAȚII
// ════════════════════════════════════════════════════════════════════════════

export const SpecTable = (car) => {
    const rows = [
        ['An fabricație', car.year],
        ['Kilometraj', car.mileage_fmt],
        ['Combustibil', car.fuel],
        ['Capacitate', car.capacity ? `${car.capacity} cm³` : null],
        ['Putere', car.horsepower ? `${car.horsepower} CP` : null],
        ['Cutie de viteze', car.transmission],
        ['Tracțiune', car.drivetrain],
        ['Caroserie', car.body_type],
        ['Culoare', car.color],
        ['Normă poluare', car.pollution_standard],
        ['Înmatriculare', car.registration_status],
        ['Volan', car.steering_wheel === 'right' ? 'Dreapta' : 'Stânga'],
        ['VIN', car.vin],
    ].filter(([, v]) => v !== null && v !== undefined && v !== '');

    return html`
<dl class="specs">
  ${rows.map(([k, v]) => html`<div class="spec"><dt>${k}</dt><dd>${v}</dd></div>`)}
</dl>`;
};

// ════════════════════════════════════════════════════════════════════════════
//  PROGRAM ȘI HARTĂ
// ════════════════════════════════════════════════════════════════════════════

export const Hours = (parc) => {
    const byDay = new Map((parc.schedule || []).map((d) => [Number(d.day), d]));
    // Ziua curentă în fusul României — nu al serverului, dacă vreodată se mută.
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Bucharest' })).getDay();

    return html`
<div class="hours">
  ${DAY_ORDER.map((d) => {
      const day = byDay.get(d);
      const closed = !day || day.closed;
      return html`
  <div class="hours-row ${d === today ? 'is-today' : ''} ${closed ? 'is-closed' : ''}">
    <span>${DAY_NAMES[d]}${d === today ? ' (azi)' : ''}</span>
    <span>${closed ? 'Închis' : `${day.open} – ${day.close}`}</span>
  </div>`;
  })}
</div>`;
};

/**
 * Hartă Google fără cheie API și fără cost. `loading="lazy"` e esențial: un
 * iframe de hartă încărcat imediat adaugă sute de kilobytes și mai multe cereri
 * blocante, chiar dacă harta e sub pliu.
 */
export const MapBlock = (parc) => {
    if (!Number.isFinite(parc.lat) || !Number.isFinite(parc.lng)) return '';
    const q = `${parc.lat},${parc.lng}`;
    const embed = `https://www.google.com/maps?q=${encodeURIComponent(q)}&hl=ro&z=16&output=embed`;
    const open = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

    return html`
<div class="stack">
  <div class="map-wrap">
    <iframe src="${embed}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
            title="Harta către ${parc.display_name}"
            allowfullscreen></iframe>
  </div>
  <a class="btn btn--ghost" href="${open}" target="_blank" rel="noopener">
    ${ICONS.pin(17)} Deschide în Google Maps
  </a>
</div>`;
};

export default {
    qs, Breadcrumb, Filters, ActiveFilters, Pagination,
    Gallery, GALLERY_JS, SpecTable, Hours, MapBlock,
};
