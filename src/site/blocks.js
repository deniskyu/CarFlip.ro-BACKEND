import { html, raw } from './html.js';
import { ICONS } from './components.js';

// ============================================================================
//  src/site/blocks.js
// ----------------------------------------------------------------------------
//  Blocurile folosite de paginile interioare. Ca și componentele din
//  `components.js`, sunt funcții pure — date în, markup afară.
// ============================================================================

/**
 * Aplicația salvează valorile BRUTE `registered` / `unregistered`, nu
 * etichetele afișate. Fără traducere, pe site apărea „unregistered" în
 * engleză, în mijlocul unei pagini în română.
 *
 * Valoarea necunoscută se afișează ca atare: anunțuri mai vechi pot conține
 * deja eticheta în română, iar o hartă strictă le-ar goli.
 */
const REG_LABELS = { registered: 'Înmatriculat', unregistered: 'Neînmatriculat' };
export const regLabel = (v) => REG_LABELS[String(v || '').toLowerCase()] || v || '';

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
    const brands = filters.brands || [];

    // Harta marcă → modele, trimisă o dată în pagină. Modelele vin din STOCUL
    // real, nu din colecția `automobiles`: un dealer cu 9 BMW-uri are 3 modele,
    // nu 60. Un apel către /api/automobiles ar fi întors și modele pentru care
    // nu are nicio mașină, iar fiecare alegere ar duce la zero rezultate.
    const modelMap = {};
    for (const b of brands) modelMap[b.slug] = b.models.map((m) => ({ s: m.slug, n: m.name, c: m.count }));

    return html`
<form class="filters" method="get" action="${action}" id="stoc-filters">
  <div class="filters-grid">

    <div class="f-field">
      <label for="f-marca">Marcă</label>
      <select id="f-marca" name="marca">
        <option value="">Toate mărcile</option>
        ${brands.map((b) => html`
        <option value="${b.slug}"${applied.marca?.slug === b.slug ? raw(' selected') : ''}>${b.name} (${b.count})</option>`)}
      </select>
    </div>

    <div class="f-field">
      <label for="f-model">Model</label>
      <select id="f-model" name="model" data-current="${applied.model?.slug || ''}">
        <option value="">Alege întâi marca</option>
      </select>
    </div>

    <div class="f-field">
      <label for="f-pmin">Preț (€)</label>
      <div class="f-pair">
        <input id="f-pmin" type="number" inputmode="numeric" name="pret_min" placeholder="min"
               min="0" value="${applied.pret_min ?? ''}">
        <input type="number" inputmode="numeric" name="pret_max" placeholder="max"
               min="0" value="${applied.pret_max ?? ''}">
      </div>
    </div>

    <div class="f-field">
      <label for="f-amin">An fabricație</label>
      <div class="f-pair">
        <input id="f-amin" type="number" inputmode="numeric" name="an_min"
               placeholder="${filters.year?.min || 'de la'}"
               min="1900" max="2100" value="${applied.an_min ?? ''}">
        <input type="number" inputmode="numeric" name="an_max"
               placeholder="${filters.year?.max || 'până la'}"
               min="1900" max="2100" value="${applied.an_max ?? ''}">
      </div>
    </div>

    <div class="f-field">
      <label for="f-kmin">Kilometraj</label>
      <div class="f-pair">
        <input id="f-kmin" type="number" inputmode="numeric" name="km_min" placeholder="min"
               min="0" value="${applied.km_min ?? ''}">
        <input type="number" inputmode="numeric" name="km_max" placeholder="max"
               min="0" value="${applied.km_max ?? ''}">
      </div>
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

  <p class="f-error" id="f-error" hidden></p>

  <div class="filters-actions">
    <button class="btn btn--primary" type="submit">Caută</button>
    <a class="btn btn--ghost" href="${action}">Șterge filtrele</a>
  </div>
</form>

<script id="stoc-models" type="application/json">${raw(JSON.stringify(modelMap).replace(/</g, '\\u003c'))}</script>
<script>${raw(FILTERS_JS)}</script>`;
};

/**
 * Scriptul filtrelor. Două lucruri, ambele mici:
 *   1. modelele se populează la alegerea mărcii, din harta de mai sus
 *   2. intervalele se verifică înainte de trimitere (min ≤ max)
 *
 * Valorile de preț și kilometraj NU au `step`. Cu `step="100"`, browserul
 * respingea 12.450 cu „cele mai apropiate valori valide sunt 12.400 și
 * 12.500" — exact genul de mesaj care face utilizatorul să creadă că site-ul
 * e stricat.
 */
export const FILTERS_JS = `
(function(){
  var f = document.getElementById('stoc-filters');
  if(!f) return;
  var bs = document.getElementById('f-marca'), ms = document.getElementById('f-model');
  var node = document.getElementById('stoc-models');
  var MAP = {};
  try { MAP = JSON.parse(node.textContent); } catch(e){}

  function fill(keep){
    var list = MAP[bs.value] || [];
    ms.innerHTML = '';
    if(!bs.value || list.length === 0){
      ms.innerHTML = '<option value="">' + (bs.value ? 'Fara modele' : 'Alege intai marca') + '</option>';
      ms.disabled = true;
      return;
    }
    ms.disabled = false;
    var o = document.createElement('option');
    o.value = ''; o.textContent = 'Toate modelele';
    ms.appendChild(o);
    list.forEach(function(m){
      var x = document.createElement('option');
      x.value = m.s; x.textContent = m.n + ' (' + m.c + ')';
      if(keep && keep === m.s) x.selected = true;
      ms.appendChild(x);
    });
  }
  bs.addEventListener('change', function(){ fill(null); });
  fill(ms.dataset.current);

  var err = document.getElementById('f-error');
  function num(name){
    var el = f.elements[name];
    if(!el || el.value === '') return null;
    var n = Number(el.value);
    return isFinite(n) ? n : null;
  }
  f.addEventListener('submit', function(e){
    var problems = [];
    var pairs = [
      ['pret_min','pret_max','Prețul minim nu poate fi mai mare decât cel maxim.'],
      ['an_min','an_max','Anul minim nu poate fi mai mare decât cel maxim.'],
      ['km_min','km_max','Kilometrajul minim nu poate fi mai mare decât cel maxim.']
    ];
    pairs.forEach(function(p){
      var a = num(p[0]), b = num(p[1]);
      if(a !== null && b !== null && a > b) problems.push(p[2]);
    });
    if(problems.length){
      e.preventDefault();
      err.textContent = problems.join(' ');
      err.hidden = false;
      err.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    err.hidden = true;
    // Câmpurile goale nu ajung în URL — altfel adresa se umple cu ?pret_min=&an_max=
    Array.prototype.forEach.call(f.elements, function(el){
      if(el.name && el.value === '') el.disabled = true;
    });
  });
})();`;

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
        ? html`<span class="gal-thumb-v">▶</span>`
        : html`<img src="${m.url}" alt="" width="84" height="63" loading="lazy" decoding="async">`}
    </button>`)}
  </div>` : ''}
</div>

<!-- Lightbox: pistă cu scroll-snap, exact ca galeria principală.
     Toate fotografiile sunt în DOM, iar navigarea o face BROWSERUL prin
     derulare nativă. Nu mai există niciun handler de touch, deci nu mai poate
     exista conflict între gestul de swipe și pinch-to-zoom. -->
<dialog class="lb" id="lb">
  <div class="lb-track" id="lb-track">
    ${media.filter((m) => m.type !== 'video').map((m) => html`
    <div class="lb-slide"><img src="${m.url}" alt="${m.alt}" loading="lazy" decoding="async"></div>`)}
  </div>
  <button class="lb-close" id="lb-close" aria-label="Închide">&times;</button>
  ${media.filter((m) => m.type !== 'video').length > 1 ? html`
  <button class="lb-nav lb-prev" id="lb-prev" aria-label="Anterioara">‹</button>
  <button class="lb-nav lb-next" id="lb-next" aria-label="Următoarea">›</button>
  <span class="lb-count" id="lb-count"></span>` : ''}
</dialog>`;
};

/**
 * Scriptul galeriei — mult mai mic decât înainte.
 *
 * ── DE CE S-A RESCRIS ─────────────────────────────────────────────────────
 * Varianta veche intercepta `touchstart`/`touchend` ca să detecteze swipe și
 * dublu-tap pentru zoom. Pe telefon asta se bătea cu pinch-ul nativ: începeai
 * să apropii degetele, browserul interpreta mișcarea ca swipe și sărea la
 * fotografia alăturată.
 *
 * Acum navigarea e derulare nativă cu scroll-snap, iar zoom-ul e cel al
 * browserului. Zero handlere de touch → zero conflict. Rămân doar: deschidere,
 * închidere, săgeți pentru desktop, tastatură și contorul.
 */
export const GALLERY_JS = `
(function(){
  var main = document.getElementById('gal-main');
  var lb = document.getElementById('lb');
  if(!main || !lb || !lb.showModal) return;

  var track = document.getElementById('lb-track');
  var count = document.getElementById('lb-count');
  var pics = [].slice.call(main.querySelectorAll('img[data-lb]'));
  var slides = [].slice.call(track.children);
  if(!slides.length) return;

  function goTo(i, smooth){
    var s = slides[Math.max(0, Math.min(slides.length - 1, i))];
    if(s) track.scrollTo({ left: s.offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
  }
  function current(){
    return Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  }
  function updateCount(){
    if(count) count.textContent = (current() + 1) + ' / ' + slides.length;
  }

  function open(i){
    lb.showModal();
    document.body.style.overflow = 'hidden';
    // Poziționarea se face DUPĂ deschidere: până atunci dialogul are lățime 0
    // și offsetLeft-ul slide-urilor e greșit.
    requestAnimationFrame(function(){ goTo(i, false); updateCount(); });
  }
  function close(){ lb.close(); }

  pics.forEach(function(p, n){ p.addEventListener('click', function(){ open(n); }); });

  [].slice.call(document.querySelectorAll('[data-go]')).forEach(function(b){
    b.addEventListener('click', function(){
      var n = +b.dataset.go, s = main.children[n];
      if(s) main.scrollTo({ left: s.offsetLeft - main.offsetLeft, behavior: 'smooth' });
    });
  });

  var c = document.getElementById('lb-close'); if(c) c.addEventListener('click', close);
  var p = document.getElementById('lb-prev'); if(p) p.addEventListener('click', function(){ goTo(current() - 1, true); });
  var n = document.getElementById('lb-next'); if(n) n.addEventListener('click', function(){ goTo(current() + 1, true); });

  var t = null;
  track.addEventListener('scroll', function(){
    if(t) clearTimeout(t);
    t = setTimeout(updateCount, 90);
  }, { passive: true });

  lb.addEventListener('close', function(){ document.body.style.overflow = ''; });
  lb.addEventListener('click', function(e){ if(e.target === lb) close(); });
  document.addEventListener('keydown', function(e){
    if(!lb.open) return;
    if(e.key === 'ArrowLeft') goTo(current() - 1, true);
    if(e.key === 'ArrowRight') goTo(current() + 1, true);
  });
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
        ['Înmatriculare', regLabel(car.registration_status)],
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
