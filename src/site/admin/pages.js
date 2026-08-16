import { html, raw, toString, styleContent } from '../html.js';
import { ADMIN_CSS } from './styles.js';
import { ADMIN_JS } from './client.js';
import { OPTIONS, LIMITS } from '../../validation/saleValidation.js';
import { LOCATIONS, COUNTIES } from '../../validation/locations.js';
import { formatPhoneDisplay } from '../../utils/phone.js';

// ============================================================================
//  src/site/admin/pages.js
// ----------------------------------------------------------------------------
//  Paginile panoului dealerului. Ca și restul site-ului: funcții pure, date în,
//  HTML afară.
//
//  Toate paginile sunt `noindex`. Un panou de login indexat aduce doar boți
//  care încearcă parole și arată neprofesionist în rezultatele Google.
// ============================================================================

const NAV = [
    { href: '/admin/masini', label: 'Mașinile mele', key: 'list' },
    { href: '/admin/adauga', label: 'Adaugă mașină', key: 'add' },
    { href: '/admin/setari', label: 'Setări site', key: 'set' },
];

const Shell = ({ parc, title, current, body, withJs = false, bare = false }) => toString(html`<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>${title} — ${parc.display_name}</title>
<link rel="icon" href="${parc.logo_url}">
<style>${styleContent(ADMIN_CSS)}</style>
</head>
<body>
${bare ? body : html`
<header class="ah">
  <div class="aw ah-in">
    <img class="ah-logo" src="${parc.logo_url}" alt="" width="34" height="34">
    <div class="ah-name">${parc.display_name}<span>panou de administrare</span></div>
    <form method="post" action="/admin/logout" style="margin:0">
      <button class="ah-out" type="submit">Ieși</button>
    </form>
  </div>
  <nav class="an">
    <div class="aw" style="display:flex;gap:.3rem">
      <a href="/" target="_blank" rel="noopener">Vezi site-ul ↗</a>
      ${NAV.map((n) => html`<a href="${n.href}"${current === n.key ? raw(' aria-current="page"') : ''}>${n.label}</a>`)}
    </div>
  </nav>
</header>
<main class="ap"><div class="aw">${body}</div></main>`}
${withJs ? html`<script>${raw(ADMIN_JS)}</script>` : ''}
</body>
</html>`);

const Msg = (type, text, list) => {
    if (!text && !list?.length) return '';
    return html`
<div class="msg msg-${type}">
  ${text}
  ${list?.length ? html`<ul>${list.map((e) => html`<li>${e}</li>`)}</ul>` : ''}
</div>`;
};

const Counter = (max) => html`<span class="acount" data-max="${max}">0/${max}</span>`;

const Select = (name, list, selected, { placeholder = 'Alege...', id = null } = {}) => html`
<select name="${name}" required${id ? raw(` id="${id}"`) : ''}>
  <option value="">${placeholder}</option>
  ${list.map((o) => {
      const v = typeof o === 'string' ? o : o.v;
      const l = typeof o === 'string' ? o : o.l;
      return html`<option value="${v}"${String(selected) === String(v) ? raw(' selected') : ''}>${l}</option>`;
  })}
</select>`;

// ════════════════════════════════════════════════════════════════════════════
//  LOGIN
// ════════════════════════════════════════════════════════════════════════════

export const renderLogin = (parc, { error, email } = {}) => Shell({
    parc, title: 'Autentificare', bare: true,
    body: html`
<div class="lw">
  <form class="lb" method="post" action="/admin/login">
    <div class="lb-head">
      <img src="${parc.logo_url}" alt="" width="60" height="60">
      <h1>${parc.display_name}</h1>
      <p>Panou de administrare</p>
    </div>

    ${error ? Msg('err', error) : ''}

    <label class="af">
      <span>Email</span>
      <input type="email" name="email" required autocomplete="username"
             inputmode="email" value="${email || ''}" autofocus>
    </label>
    <label class="af">
      <span>Parolă</span>
      <input type="password" name="password" required autocomplete="current-password">
    </label>

    <button class="b b-pri b-full" type="submit">Intră în cont</button>

    <div class="lb-foot">
      Folosește emailul și parola contului tău CarFlip.<br>
      Parolă uitată? Resetează-o din aplicația mobilă.<br>
      <a href="/">← Înapoi la site</a>
    </div>
  </form>
</div>`,
});

// ════════════════════════════════════════════════════════════════════════════
//  LISTA MAȘINILOR
// ════════════════════════════════════════════════════════════════════════════

export const renderList = (parc, { cars, processing, flash }) => Shell({
    parc, title: 'Mașinile mele', current: 'list', withJs: true,
    body: html`
<div class="ahead">
  <div>
    <h1>Mașinile mele</h1>
    <p class="amuted">${cars.length} ${cars.length === 1 ? 'anunț activ' : 'anunțuri active'}</p>
  </div>
  <a class="b b-pri" href="/admin/adauga">+ Adaugă mașină</a>
</div>

${flash ? Msg(flash.type, flash.text) : ''}

${processing > 0 ? Msg('info',
  `${processing} ${processing === 1 ? 'anunț se procesează' : 'anunțuri se procesează'}. ` +
  `Pozele se optimizează în fundal — apar pe site în câteva minute.`) : ''}

${cars.length === 0 ? html`
<div class="ac" style="text-align:center;padding:2.5rem 1rem">
  <h2>Încă nu ai nicio mașină</h2>
  <p class="amuted" style="margin-bottom:1.2rem">
    Adaugă prima mașină și apare imediat pe site și în aplicația CarFlip.
  </p>
  <a class="b b-pri" href="/admin/adauga">Adaugă prima mașină</a>
</div>` : html`
<div class="alist">
  ${cars.map((c) => html`
  <article class="ai">
    ${c.cover
        ? html`<img class="ai-img" src="${c.cover}" alt="" width="96" height="72" loading="lazy">`
        : html`<div class="ai-img"></div>`}
    <div class="ai-b">
      <div class="ai-t">${c.title}</div>
      <div class="ai-m">${[c.year, c.km, c.fuel].filter(Boolean).join(' · ')}</div>
      <div class="ai-p">${c.price}</div>
      ${c.processing ? html`<span class="tag tag-warn">se procesează</span>` : ''}
      <div class="ai-a">
        <a class="b b-ghost b-sm" href="/admin/masina/${c.id}">Editează</a>
        <button class="b b-danger b-sm" type="button"
                data-del="${c.id}" data-name="${c.title}">Șterge</button>
      </div>
    </div>
  </article>`)}
</div>`}

<form id="del-form" method="post" style="display:none">
  <input type="hidden" name="_confirm" value="1">
</form>`,
});

// ════════════════════════════════════════════════════════════════════════════
//  FORMULAR MAȘINĂ
// ════════════════════════════════════════════════════════════════════════════

/**
 * Același formular pentru adăugare și editare.
 *
 * La editare, pozele se înlocuiesc COMPLET sau deloc — nu se pot adăuga
 * individual. E o limitare asumată: ruta existentă `edit-with-media` face
 * exact asta, iar mesajul din formular spune limpede ce se întâmplă, ca
 * dealerul să nu piardă poze din neatenție.
 */
export const renderCarForm = (parc, { car, brands, errors, flash } = {}) => {
    const isEdit = !!car;
    const v = car || {};

    return Shell({
        parc, title: isEdit ? 'Editează mașina' : 'Adaugă mașină',
        current: isEdit ? 'list' : 'add', withJs: true,
        body: html`
<div class="ahead">
  <h1>${isEdit ? 'Editează mașina' : 'Adaugă mașină'}</h1>
  <a class="b b-ghost" href="/admin/masini">Înapoi</a>
</div>

${flash ? Msg(flash.type, flash.text) : ''}
${errors?.length ? Msg('err', 'Verifică următoarele:', errors) : ''}

<form id="car-form" method="post" enctype="multipart/form-data"
      action="${isEdit ? `/admin/masina/${v.id}` : '/admin/adauga'}"
      data-mode="${isEdit ? 'edit' : 'new'}">

  <div class="ac">
    <h2>Mașina</h2>
    <div class="arow">
      <label class="af">
        <span>Marcă</span>
        <select name="brand_id" id="brand-sel" required>
          <option value="">Alege marca...</option>
          ${brands.map((b) => html`
          <option value="${b.id}" data-name="${b.name}"${Number(v.brand_id) === b.id ? raw(' selected') : ''}>${b.name}</option>`)}
        </select>
      </label>
      <label class="af">
        <span>Model</span>
        <select name="model_id" id="model-sel" required ${isEdit ? '' : raw('disabled')}
                data-current="${v.model_id || ''}">
          <option value="">${isEdit ? v.model_name : 'Alege întâi marca'}</option>
        </select>
      </label>
    </div>
    <input type="hidden" name="brand_name" id="brand-name" value="${v.brand_name || ''}">
    <input type="hidden" name="model_name" id="model-name" value="${v.model_name || ''}">

    <label class="af">
      <span>Titlu anunț ${Counter(LIMITS.TITLE)}</span>
      <input type="text" name="title" required maxlength="${LIMITS.TITLE + 10}"
             data-count placeholder="ex. BMW Seria 3 xDrive impecabil" value="${v.title || ''}">
      <small>Apare mare pe card și în titlul paginii din Google.</small>
    </label>

    <div class="arow-3">
      <label class="af"><span>An fabricație</span>
        <input type="number" name="production_year" required inputmode="numeric"
               min="1950" max="${new Date().getFullYear() + 1}" value="${v.production_year || ''}"></label>
      <label class="af"><span>Kilometraj</span>
        <input type="number" name="mileage" required inputmode="numeric" min="0"
               placeholder="ex. 145000" value="${v.mileage || ''}"></label>
      <label class="af"><span>Preț (€)</span>
        <input type="number" name="price" required inputmode="numeric" min="1"
               placeholder="ex. 12500" value="${v.price || ''}"></label>
    </div>

    <div class="arow-3">
      <label class="af"><span>Combustibil</span>
        ${Select('engine_fuel', OPTIONS.fuel, v.engine_fuel, { id: 'fuel-sel' })}</label>
      <label class="af"><span>Capacitate motor</span>
        ${Select('engine_capacity', OPTIONS.capacity, v.engine_capacity, { id: 'cap-sel' })}</label>
      <label class="af"><span>Putere (CP)</span>
        <input type="number" name="horsepower" inputmode="numeric" min="1" max="9999"
               placeholder="opțional" value="${v.horsepower || ''}"></label>
    </div>
    <small class="amuted" style="display:block;margin:-.4rem 0 .9rem">
      Aceleași opțiuni ca în aplicație. La combustibil electric, capacitatea se
      completează singură cu „Fără (Electric)".
    </small>

    <div class="arow-3">
      <label class="af"><span>Cutie de viteze</span>${Select('transmission', OPTIONS.transmission, v.transmission)}</label>
      <label class="af"><span>Tracțiune</span>${Select('drivetrain', OPTIONS.drivetrain, v.drivetrain)}</label>
      <label class="af"><span>Caroserie</span>${Select('body_type', OPTIONS.body, v.body_type)}</label>
    </div>

    <div class="arow-3">
      <label class="af"><span>Culoare</span>${Select('color', OPTIONS.color, v.color)}</label>
      <label class="af"><span>Normă poluare</span>${Select('pollution_standard', OPTIONS.pollution, v.pollution_standard)}</label>
      <label class="af"><span>Înmatriculare</span>${Select('registration_status', OPTIONS.registration, v.registration_status)}</label>
    </div>

    <div class="arow">
      <label class="af"><span>Volan</span>${Select('steering_wheel', OPTIONS.steering, v.steering_wheel || 'left')}</label>
      <label class="af"><span>VIN (opțional)</span>
        <input type="text" name="vin" maxlength="17" placeholder="serie șasiu"
               value="${v.vin || ''}" style="text-transform:uppercase"></label>
    </div>

    <label class="achk"><input type="checkbox" name="negotiable" ${v.negotiable ? raw('checked') : ''}> Preț negociabil</label>
    <label class="achk"><input type="checkbox" name="exchange_accepted" ${v.exchange_accepted ? raw('checked') : ''}> Accept schimb</label>
    <label class="achk"><input type="checkbox" name="for_dismante" ${v.for_dismante ? raw('checked') : ''}> Pentru dezmembrare</label>
  </div>

  <div class="ac">
    <h2>Descriere</h2>
    <label class="af">
      <span>Detalii despre mașină ${Counter(LIMITS.DESCRIPTION)}</span>
      <textarea name="description" required maxlength="${LIMITS.DESCRIPTION + 100}" data-count
                rows="8" placeholder="Dotări, istoric de service, ce s-a schimbat recent, de ce merită.">${v.description || ''}</textarea>
      <small>
        Scrie concret: dotări, ce s-a schimbat recent, istoricul de service.
        Anunțurile cu descrieri reale apar mult mai bine în Google — sub 200 de
        caractere, site-ul nu se poate indexa deloc.
      </small>
    </label>
  </div>

  <div class="ac">
    <h2>Contact și locație</h2>
    <div class="arow-3">
      <label class="af"><span>Județ</span>
        <select name="county" id="county-sel" required>
          <option value="">Alege județul...</option>
          ${COUNTIES.map((c) => html`
          <option value="${c}"${(v.county || parc.county) === c ? raw(' selected') : ''}>${c}</option>`)}
        </select></label>
      <label class="af"><span>Oraș</span>
        <select name="city" id="city-sel" required data-current="${v.city || parc.city || ''}">
          <option value="">Alege întâi județul</option>
        </select></label>
      <label class="af"><span>Telefon</span>
        <input type="tel" name="phone_number" required inputmode="tel" maxlength="10"
               value="${v.phone_number || formatPhoneDisplay(parc.phone)}"></label>
    </div>
    <small class="amuted">
      Aceleași județe și orașe ca în aplicație. Locația greșită scoate anunțul
      din filtrele de pe site și din feed.
    </small>
  </div>

<script id="loc-data" type="application/json">${raw(JSON.stringify(
    LOCATIONS.reduce((acc, l) => { acc[l.judet] = l.orase; return acc; }, {})
  ).replace(/</g, '\\u003c'))}</script>

  <div class="ac">
    <h2>Fotografii</h2>
    ${isEdit ? Msg('info',
      'Dacă alegi poze noi, ele le ÎNLOCUIESC complet pe cele existente. ' +
      'Lasă câmpul gol ca să păstrezi pozele actuale și să modifici doar textul.') : ''}

    <label class="up" for="files">
      <strong>Alege pozele mașinii</strong>
      <span>Până la ${LIMITS.MAX_FILES} fișiere · prima poză devine coperta · un videoclip opțional</span>
      <input type="file" id="files" name="mediaFiles" multiple hidden
             accept="image/*,video/mp4,video/quicktime">
    </label>

    <div class="thumbs" id="thumbs"></div>
    <p class="amuted" id="files-info" style="margin-top:.6rem"></p>

    <div class="pbar" id="pbar" hidden><i></i></div>
    <p class="pinfo" id="pinfo" hidden></p>
  </div>

  <div class="arow-btn">
    <button class="b b-pri" type="submit" id="submit-btn">
      ${isEdit ? 'Salvează modificările' : 'Publică anunțul'}
    </button>
    <a class="b b-ghost" href="/admin/masini">Renunță</a>
  </div>
</form>`,
    });
};

// ════════════════════════════════════════════════════════════════════════════
//  SETĂRI SITE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Dealerul editează DOAR textele și bannerul.
 *
 * Nu are acces la culori, layout, presetare, logo sau date de firmă. Fiecare
 * câmp editabil în plus e o modalitate în plus de a strica site-ul — iar
 * site-urile astea sunt portofoliul cu care vinzi.
 */
export const renderSettings = (parc, { flash, errors } = {}) => Shell({
    parc, title: 'Setări site', current: 'set', withJs: true,
    body: html`
<div class="ahead">
  <h1>Setări site</h1>
  <a class="b b-ghost" href="/" target="_blank" rel="noopener">Vezi site-ul ↗</a>
</div>

${flash ? Msg(flash.type, flash.text) : ''}
${errors?.length ? Msg('err', 'Verifică următoarele:', errors) : ''}

<form method="post" action="/admin/setari" enctype="multipart/form-data" id="set-form">
  <div class="ac">
    <h2>Textul de pe prima pagină</h2>
    <label class="af">
      <span>Titlu principal ${Counter(60)}</span>
      <input type="text" name="hero_title" maxlength="70" data-count
             value="${parc.hero_title || ''}" placeholder="Mașini verificate, fără surprize">
    </label>
    <label class="af">
      <span>Subtitlu ${Counter(140)}</span>
      <textarea name="hero_subtitle" maxlength="160" data-count rows="3"
        placeholder="O frază despre ce vă diferențiază.">${parc.hero_subtitle || ''}</textarea>
      <small>Numărul de mașini se adaugă automat dedesubt — nu-l scrie aici.</small>
    </label>
  </div>

  <div class="ac">
    <h2>Despre noi</h2>
    <label class="af">
      <span>Titlu secțiune ${Counter(60)}</span>
      <input type="text" name="about_title" maxlength="70" data-count value="${parc.about_title || ''}">
    </label>
    <label class="af">
      <span>Text ${Counter(1200)}</span>
      <textarea name="about_text" maxlength="1300" data-count rows="8"
        placeholder="Cine sunteți, de când, ce fel de mașini aduceți.">${parc.about_text || ''}</textarea>
      <small>Dacă îl lași gol, se generează automat din datele parcului.</small>
    </label>
    <label class="af">
      <span>Intro pagina de contact ${Counter(300)}</span>
      <textarea name="contact_intro" maxlength="330" data-count rows="3">${parc.contact_intro || ''}</textarea>
    </label>
  </div>

  <div class="ac">
    <h2>Imaginea de fundal</h2>
    <p class="amuted" style="margin-bottom:.9rem">
      Se afișează în banda de sus a paginii principale. Alege o fotografie
      panoramică din parc — se decupează automat la formatul potrivit.
    </p>
    <img src="${parc.banner_url}" alt="" width="800" height="267"
         style="width:100%;aspect-ratio:3/1;object-fit:cover;border-radius:10px;border:1px solid #e4e4e7">
    <label class="up" for="banner" style="margin-top:.8rem">
      <strong>Schimbă imaginea</strong>
      <span>Recomandat: fotografie orizontală, minim 1600px lățime</span>
      <input type="file" id="banner" name="banner" hidden accept="image/*">
    </label>
    <div class="thumbs" id="banner-thumb"></div>
  </div>

  <div class="ac">
    <h2>Contact</h2>
    <div class="arow">
      <label class="af"><span>Telefon</span>
        <input type="tel" name="phone" required inputmode="tel"
               value="${formatPhoneDisplay(parc.phone)}"></label>
      <label class="af"><span>WhatsApp</span>
        <input type="tel" name="whatsapp" required inputmode="tel"
               value="${formatPhoneDisplay(parc.whatsapp)}"></label>
    </div>
    <label class="af"><span>Email</span>
      <input type="email" name="email" value="${parc.email || ''}"></label>
    <small class="amuted">
      Adresa, programul, culorile și logo-ul se modifică din partea CarFlip.
      Scrie-ne dacă s-a schimbat ceva.
    </small>
  </div>

  <div class="arow-btn">
    <button class="b b-pri" type="submit">Salvează</button>
    <a class="b b-ghost" href="/admin/masini">Renunță</a>
  </div>
</form>`,
});

export default { renderLogin, renderList, renderCarForm, renderSettings };
