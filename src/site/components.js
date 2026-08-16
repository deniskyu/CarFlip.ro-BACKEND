import { html, raw } from './html.js';
import { SERVICE_ICONS, DEFAULT_ICON } from '../utils/serviceIcons.js';
import { formatPhoneDisplay } from '../utils/phone.js';

// ============================================================================
//  src/site/components.js   — versiunea cu VARIANTE (înlocuiește cea din 6a)
// ----------------------------------------------------------------------------
//  Fiecare componentă acceptă acum litera de variantă din presetare. Diferența
//  față de 6a: acolo `variants.header` și `variants.footer` erau declarate dar
//  ignorate, deci toate presetările aveau același antet și același subsol.
//
//  ── CUM E STRUCTURATĂ VARIAȚIA ────────────────────────────────────────────
//  Markup identic acolo unde se poate, clasă modificatoare pentru restul.
//  Se ramifică doar unde STRUCTURA chiar diferă — de exemplu antetul `c`, care
//  are o bandă suplimentară deasupra.
//
//  Motivul e practic: cu cât markup-ul e mai comun, cu atât o corectură se
//  aplică simultan la toate cele 6 presetări. Dacă fiecare ar avea propriul
//  arbore HTML, un bug de accesibilitate ar trebui reparat de șase ori.
// ============================================================================

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.mobilefrontendframe';
const APP_STORE = 'https://apps.apple.com/ro/app/id6760683057';

const DAY_NAMES = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const icon = (body, size = 20) => raw(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
);

export const ICONS = {
    phone: (s) => icon(`<path d="M8.5 3.5h-3a2 2 0 0 0-2 2.2c.6 6.5 5.3 11.2 11.8 11.8a2 2 0 0 0 2.2-2v-3l-3.5-1.2-1.8 1.8a13 13 0 0 1-4.3-4.3l1.8-1.8L8.5 3.5z"/>`, s),
    whatsapp: (s) => icon(`<path d="M3.5 20.5l1.3-4.4A8.4 8.4 0 1 1 8 19.3l-4.5 1.2z"/><path d="M9 9.2c.2 1 .7 2 1.5 2.8s1.8 1.3 2.8 1.5l1-1.2 2 .8v1.6c-2.7.3-5.3-1-6.9-2.6S8 8.5 8.3 5.8h1.6l.8 2L9 9.2z"/>`, s),
    menu: (s) => icon(`<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>`, s),
    arrow: (s) => icon(`<path d="M5 12h13"/><path d="m12 5 7 7-7 7"/>`, s),
    pin: (s) => icon(`<path d="M12 21.5s7-6.3 7-11.2a7 7 0 1 0-14 0c0 4.9 7 11.2 7 11.2z"/><circle cx="12" cy="10" r="2.6"/>`, s),
    clock: (s) => icon(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.5 2"/>`, s),
    facebook: (s) => icon(`<path d="M14 8.5h2.5V5.5H14a3.5 3.5 0 0 0-3.5 3.5v2H8.5v3h2v6.5h3v-6.5h2.3l.7-3h-3v-1.7c0-.5.4-.8 1-.8z"/>`, s),
    instagram: (s) => icon(`<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17" cy="7" r="1"/>`, s),
    tiktok: (s) => icon(`<path d="M15 4.5c.6 2 2 3.3 4 3.6v3c-1.6 0-3-.5-4.2-1.4v5.6a5.6 5.6 0 1 1-4.7-5.5v3.1a2.6 2.6 0 1 0 1.9 2.5V4.5z"/>`, s),
    apple: (s) => icon(`<path d="M15.5 12.4c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.15-2.8.85-3.5.85s-1.8-.83-3-.8c-1.5.02-2.9.9-3.7 2.25-1.6 2.75-.4 6.8 1.1 9 .75 1.1 1.6 2.3 2.8 2.25 1.1-.05 1.5-.7 2.9-.7s1.7.7 2.9.7c1.2 0 2-1.1 2.7-2.2.85-1.25 1.2-2.5 1.2-2.55-.03-.02-2.3-.9-2.3-3.5z"/><path d="M13.4 5.6c.6-.75 1-1.8.9-2.85-.87.04-1.93.58-2.56 1.32-.56.65-1.05 1.72-.92 2.73.97.08 1.96-.5 2.58-1.2z"/>`, s),
    play: (s) => icon(`<path d="M4.5 3.2 15 12 4.5 20.8a1 1 0 0 1-.5-.9V4.1a1 1 0 0 1 .5-.9z"/><path d="m15 12 4.3-3.6a1 1 0 0 1 0 1.7z" fill="currentColor"/><path d="M4.6 3.1 15 12"/>`, s),
};

const svcIcon = (name, size = 22) =>
    icon((SERVICE_ICONS[name] || SERVICE_ICONS[DEFAULT_ICON]).body, size);

const NAV = [
    { href: '/', label: 'Acasă', key: 'home' },
    { href: '/stoc', label: 'Stoc mașini', key: 'stoc' },
    { href: '/contact', label: 'Contact', key: 'contact' },
];

/**
 * Blocul de identitate din antet. Forma logo-ului, mărimea și felul în care se
 * afișează orașul variază cu presetarea — vezi `.brand--a/b/c/d` din
 * stylesVariants.js. Markup-ul rămâne identic; doar clasa diferă.
 */
const Brand = (parc, { variant = 'a', size = 42 } = {}) => html`
<a class="brand brand--${variant}" href="/">
  <img class="brand-logo" src="${parc.logo_url}" alt=""
       width="${size}" height="${size}" fetchpriority="high">
  <span class="brand-name">${parc.display_name}
    <span class="brand-city">${parc.city}${parc.county ? `, ${parc.county}` : ''}</span>
  </span>
</a>`;

const NavLinks = (current) =>
    NAV.map((n) => html`<a href="${n.href}"${current === n.key ? raw(' aria-current="page"') : ''}>${n.label}</a>`);

// ════════════════════════════════════════════════════════════════════════════
//  HEADER — 3 variante
// ════════════════════════════════════════════════════════════════════════════

/**
 * Telefonul rămâne VIZIBIL în toate variantele, pe orice lățime. Nu intră
 * niciodată în meniul hamburger: dealerii vând prin telefon, iar pe mobil
 * butonul de apelare e cel mai eficient element de conversie din tot site-ul.
 *
 *   a — logo stânga · meniu centru · telefon dreapta        (Clar, Editorial)
 *   b — logo stânga · meniu dreapta · antet mai înalt        (Nocturn, Cald)
 *   c — bandă subțire deasupra cu adresă și program, apoi rândul principal
 *       (Compact, Industrial) — mai multă informație în același spațiu
 */
export const Header = (parc, { current, preset } = {}) => {
    const v = preset?.variants?.header || 'a';
    const tel = `tel:+${parc.phone}`;
    const openDays = (parc.schedule || []).filter((d) => !d.closed);
    const shortHours = openDays.length
        ? `${openDays[0].open} – ${openDays[0].close}`
        : null;

    const bv = preset?.variants?.brand || 'a';
    const mv = preset?.variants?.menu || 'a';

    return html`
<header class="site-header hdr--${v} menu--${mv}">
  ${v === 'c' ? html`
  <div class="hdr-strip">
    <div class="wrap hdr-strip-in">
      <span>${ICONS.pin(13)} ${parc.address}, ${parc.city}</span>
      ${shortHours ? html`<span>${ICONS.clock(13)} Luni–Vineri ${shortHours}</span>` : ''}
      <a href="${tel}">${ICONS.phone(13)} ${formatPhoneDisplay(parc.phone)}</a>
    </div>
  </div>` : ''}

  <div class="wrap">
    <input type="checkbox" id="nav-toggle" class="nav-toggle" aria-hidden="true">
    <div class="header-inner">
      ${Brand(parc, { variant: bv, size: bv === 'b' ? 48 : 42 })}

      <nav class="nav" aria-label="Meniu principal">${NavLinks(current)}</nav>

      <div class="header-cta">
        <a class="header-phone" href="${tel}">
          ${ICONS.phone(17)}<span>${formatPhoneDisplay(parc.phone)}</span>
        </a>
        <label class="nav-btn" for="nav-toggle" aria-label="Deschide meniul">${ICONS.menu(20)}</label>
      </div>
    </div>

    <nav class="nav-mobile" aria-label="Meniu mobil">${NavLinks(current)}</nav>
  </div>
</header>`;
};

// ════════════════════════════════════════════════════════════════════════════
//  HERO — 4 variante
// ════════════════════════════════════════════════════════════════════════════

/**
 *   a — text aliniat stânga, ancorat jos                     (Clar, Industrial)
 *   b — centrat, înalt, tipografie mare                       (Nocturn)
 *   c — bandă scurtă, cu un rând de cifre sub titlu           (Compact)
 *   d — centrat editorial, linie subțire deasupra             (Editorial)
 *
 * Gradientul întunecat e AUTOMAT și neconfigurabil, în toate variantele.
 * Rezolvă definitiv „text alb pe cer alb", indiferent ce banner urcă dealerul.
 */
export const Hero = (parc, { total, preset, filters }) => {
    const v = preset?.variants?.hero || 'a';
    const title = parc.hero_title || `Mașini verificate în ${parc.city}`;
    const sub = parc.hero_subtitle || '';

    const stats = v === 'c' && filters ? [
        [total, total === 1 ? 'mașină în stoc' : 'mașini în stoc'],
        [filters.brands?.length || 0, 'mărci disponibile'],
        [filters.price?.min ? `${Math.round(filters.price.min / 1000)}k €` : '—', 'preț de la'],
    ] : null;

    return html`
<section class="hero hero--${v} hero--anim-${preset?.heroAnim || 'none'}">
  <div class="hero-media">
    <img src="${parc.banner_url}" alt="" width="1920" height="640"
         fetchpriority="high" decoding="async">
  </div>
  <div class="hero-scrim"></div>
  <div class="wrap">
    <div class="hero-inner">
      ${v === 'd' ? html`<span class="hero-rule"></span>` : ''}
      ${v === 'd' ? html`<p class="hero-eyebrow">${parc.city}, ${parc.county}</p>` : ''}
      <h1>${title}</h1>
      ${sub ? html`<p class="hero-sub">${sub}</p>` : ''}

      ${stats ? html`
      <div class="hero-stats">
        ${stats.map(([n, label]) => html`<div><b>${n}</b><span>${label}</span></div>`)}
      </div>` : total > 0 ? html`
      <div class="hero-count">
        <b>${total}</b> ${total === 1 ? 'autovehicul disponibil' : 'autovehicule disponibile'}
      </div>` : ''}

      <div class="hero-actions">
        <a class="btn btn--on-dark" href="/stoc">Vezi mașinile noastre ${ICONS.arrow(17)}</a>
        <a class="btn btn--outline-light" href="/contact">${ICONS.pin(17)} Unde ne găsești</a>
      </div>
    </div>
  </div>
</section>`;
};

// ════════════════════════════════════════════════════════════════════════════
//  CARD DE MAȘINĂ — 4 variante
// ════════════════════════════════════════════════════════════════════════════

/**
 *   a — preț suprapus pe poză, jos-stânga                     (Clar, Cald)
 *   b — preț mare sub poză, specificații ca pastile           (Nocturn)
 *   c — dens, preț pe același rând cu titlul                  (Compact, Industrial)
 *   d — cadru subțire, titlu serif, preț aliniat la dreapta   (Editorial)
 *
 * `width` și `height` pe <img> vin din baza de date (le scrie mediaWorker).
 * Împreună cu `aspect-ratio` din CSS, rezervă spațiul înainte ca poza să se
 * încarce → CLS zero, pe care Google îl măsoară direct.
 */
export const CarCard = (car, { variant = 'a', eager = false } = {}) => {
    const specs = [
        car.year, car.mileage_fmt, car.fuel,
        car.horsepower ? `${car.horsepower} CP` : null,
        car.transmission,
    ].filter(Boolean);

    const overlayPrice = variant === 'a';
    const chipSpecs = variant === 'b';

    const media = car.cover
        ? html`<img src="${car.cover.url}" alt="${car.cover.alt}"
                 ${car.cover.width ? raw(`width="${car.cover.width}"`) : ''}
                 ${car.cover.height ? raw(`height="${car.cover.height}"`) : ''}
                 loading="${eager ? 'eager' : 'lazy'}"
                 ${eager ? raw('fetchpriority="high"') : raw('decoding="async"')}>`
        : html`<div class="car-noimg" aria-hidden="true"></div>`;

    return html`
<article class="car car--${variant} reveal">
  <a class="car-media" href="${car.url}" aria-label="${car.name} ${car.year}">
    ${media}
    ${overlayPrice ? html`<span class="car-price">${car.price_fmt}</span>` : ''}
    ${overlayPrice && car.negotiable ? html`<span class="car-neg">negociabil</span>` : ''}
  </a>
  <div class="car-body">
    ${!overlayPrice ? html`
    <div class="car-priceline">
      <span class="car-price">${car.price_fmt}</span>
      ${car.negotiable ? html`<span class="car-neg">negociabil</span>` : ''}
    </div>` : ''}
    <h3 class="car-title"><a href="${car.url}">${car.title || car.name}</a></h3>
    <ul class="car-specs ${chipSpecs ? 'car-specs--chips' : ''}">
      ${specs.map((s) => html`<li>${s}</li>`)}
    </ul>
    <div class="car-foot">
      <a class="car-wa" href="${car.whatsapp_url}" target="_blank" rel="noopener nofollow">
        ${ICONS.whatsapp(17)} <span>Întreabă pe WhatsApp</span>
      </a>
    </div>
  </div>
</article>`;
};

/** Litera de variantă pentru card, dedusă din presetare. */
export const cardVariant = (preset) => preset?.variants?.card || 'a';

// ════════════════════════════════════════════════════════════════════════════
//  SERVICII — 4 variante
// ════════════════════════════════════════════════════════════════════════════

export const Services = (parc, { preset }) => {
    const list = Array.isArray(parc.services) ? parc.services : [];
    // Gol → secțiunea nu se randează deloc. Niciodată un titlu de secțiune cu
    // spațiu alb dedesubt.
    if (list.length === 0) return '';

    const v = preset?.variants?.services || 'a';
    const cls = v === 'b' || v === 'c' ? 'svc svc--row' : v === 'd' ? 'svc svc--num' : 'svc';

    return html`
<section class="section section--tint">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow">Servicii</p>
      <h2>${parc.services_title || 'Ce oferim'}</h2>
    </div>
    <div class="svc-grid">
      ${list.map((s, i) => html`
      <div class="${cls} reveal">
        ${v === 'd' ? html`<span class="svc-no">0${i + 1}</span>` : ''}
        <span class="svc-icon">${svcIcon(s.icon, v === 'b' || v === 'c' ? 20 : 24)}</span>
        <div>
          <h3>${s.title}</h3>
          <p>${s.text}</p>
        </div>
      </div>`)}
    </div>
  </div>
</section>`;
};

// ════════════════════════════════════════════════════════════════════════════
//  BANDĂ DE CONTACT
// ════════════════════════════════════════════════════════════════════════════

export const CtaBand = (parc, { whatsappUrl }) => html`
<section class="cta-band">
  <div class="wrap cta-inner">
    <div>
      <h2>Ai găsit ceva care îți place?</h2>
      <p>Scrie-ne pe WhatsApp sau sună direct. Îți răspundem rapid.</p>
    </div>
    <div class="cta-actions">
      <a class="btn btn--on-dark" href="${whatsappUrl}" target="_blank" rel="noopener nofollow">
        ${ICONS.whatsapp(18)} Scrie pe WhatsApp
      </a>
      <a class="cta-phone" href="tel:+${parc.phone}">
        ${ICONS.phone(18)} ${formatPhoneDisplay(parc.phone)}
      </a>
    </div>
  </div>
</section>`;

// ════════════════════════════════════════════════════════════════════════════
//  FOOTER — 3 variante
// ════════════════════════════════════════════════════════════════════════════

/**
 *   a — trei coloane                        (Clar, Compact, Industrial)
 *   b — două coloane, partea legală centrată (Nocturn)
 *   c — bloc de brand centrat sus, apoi coloane (Editorial, Cald)
 */
export const Footer = (parc, { preset } = {}) => {
    const v = preset?.variants?.footer || 'a';
    const schedule = Array.isArray(parc.schedule) ? parc.schedule : [];
    const byDay = new Map(schedule.map((d) => [Number(d.day), d]));

    const socials = [
        parc.facebook_url && { url: parc.facebook_url, icon: ICONS.facebook(18), label: 'Facebook' },
        parc.instagram_url && { url: parc.instagram_url, icon: ICONS.instagram(18), label: 'Instagram' },
        parc.tiktok_url && { url: parc.tiktok_url, icon: ICONS.tiktok(18), label: 'TikTok' },
    ].filter(Boolean);

    const year = new Date().getFullYear();

    const brandBlock = html`
<div class="footer-brand">
  <img src="${parc.logo_url}" alt="" width="44" height="44" loading="lazy">
  <strong>${parc.display_name}</strong>
</div>
<p class="footer-addr">${ICONS.pin(15)} ${parc.address}, ${parc.city}, ${parc.county}</p>
${socials.length ? html`
<div class="footer-social">
  ${socials.map((s) => html`
  <a href="${s.url}" target="_blank" rel="noopener nofollow" aria-label="${s.label}">${s.icon}</a>`)}
</div>` : ''}
`;

    const linksBlock = html`
<h4>Secțiuni</h4>
<ul class="footer-list">${NAV.map((n) => html`<li><a href="${n.href}">${n.label}</a></li>`)}</ul>
<h4 style="margin-top:1.6rem">Contact</h4>
<ul class="footer-list">
  <li><a href="tel:+${parc.phone}">${formatPhoneDisplay(parc.phone)}</a></li>
  ${parc.email ? html`<li><a href="mailto:${parc.email}">${parc.email}</a></li>` : ''}
</ul>`;

    const hoursBlock = html`
<h4>${ICONS.clock(14)} Program</h4>
${DAY_ORDER.map((d) => {
    const day = byDay.get(d);
    const closed = !day || day.closed;
    return html`
<div class="footer-hours ${closed ? 'is-closed' : ''}">
  <span>${DAY_NAMES[d]}</span>
  <span>${closed ? 'Închis' : `${day.open} – ${day.close}`}</span>
</div>`;
})}`;

    return html`
<footer class="site-footer ftr--${v}">
  <div class="wrap">
    ${v === 'c' ? html`
    <div class="footer-hero">${brandBlock}</div>
    <div class="footer-grid">
      <div>${linksBlock}</div>
      <div>${hoursBlock}</div>
    </div>` : html`
    <div class="footer-grid">
      <div>${brandBlock}</div>
      <div>${linksBlock}</div>
      ${v === 'b' ? '' : html`<div>${hoursBlock}</div>`}
    </div>
    ${v === 'b' ? html`<div class="footer-hours-row">${hoursBlock}</div>` : ''}`}

    <div class="footer-legal">
      <p class="footer-firm">
        ${parc.company_name} · CUI ${parc.company_cui} · Reg. Com. ${parc.company_reg}<br>
        Sediu social: ${parc.company_address}
      </p>
      <div class="footer-links">
        <a href="/termeni">Termeni și condiții</a>
        <a href="/confidentialitate">Politica de confidențialitate</a>
        <a href="/cookies">Politica de cookie-uri</a>
      </div>
      <div class="footer-made">
        <span>© ${year} ${parc.display_name}. Toate drepturile rezervate.</span>
        <span>Site realizat de <a href="https://car-flip.com" target="_blank" rel="noopener">CarFlip</a></span>
      </div>

      <!-- Badge-urile stau lângă mențiunea CarFlip, nu sub datele de contact
           ale dealerului: acolo păreau parte din oferta lui. Aici e limpede
           că aplicația e a noastră. -->
      <div class="footer-app">
        <h4>Descarcă aplicația CarFlip</h4>
        <p>Mii de mașini, notificări la anunțuri noi și contact direct cu vânzătorul.</p>
        <div class="store-badges">
          <a class="store-badge" href="${APP_STORE}" target="_blank" rel="noopener">
            ${ICONS.apple(20)}<span>Descarcă din<b>App Store</b></span>
          </a>
          <a class="store-badge" href="${PLAY_STORE}" target="_blank" rel="noopener">
            ${ICONS.play(20)}<span>Disponibilă pe<b>Google Play</b></span>
          </a>
        </div>
      </div>
    </div>
  </div>
</footer>`;
};

// ════════════════════════════════════════════════════════════════════════════
//  STICKY WHATSAPP
// ════════════════════════════════════════════════════════════════════════════

/**
 * Poziția e FIXĂ dreapta-jos în toate presetările. Nu e limitare tehnică:
 * acolo ajunge degetul mare pe telefon, e convenția pe care o recunoaște toată
 * lumea și nu acoperă conținut. Variază doar forma.
 */
export const StickyWhatsapp = (parc, { whatsappUrl, preset }) => {
    const v = preset?.variants?.sticky || 'pill';
    const mod = v === 'circle' ? 'sticky-wa--circle' : v === 'bar' ? 'sticky-wa--bar' : '';
    return html`
<a class="sticky-wa ${mod}" href="${whatsappUrl}" target="_blank" rel="noopener nofollow"
   aria-label="Scrie-ne pe WhatsApp">
  ${ICONS.whatsapp(v === 'circle' ? 26 : 19)}<span>Scrie pe WhatsApp</span>
</a>`;
};

export default {
    Header, Hero, CarCard, cardVariant, Services, CtaBand, Footer, StickyWhatsapp, ICONS,
};
