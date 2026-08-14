import { html, raw } from '../html.js';
import { Layout } from '../layout.js';
import { getPreset } from '../presets.js';
import { Header, CarCard, CtaBand, Footer, StickyWhatsapp, ICONS } from '../components.js';
import {
    qs, Breadcrumb, Filters, ActiveFilters, Pagination,
    Gallery, GALLERY_JS, SpecTable, Hours, MapBlock,
} from '../blocks.js';
import { getLegalDoc } from '../legal/texts.js';
import { autoDealerLd, vehicleLd, breadcrumbLd, itemListLd, faqLd } from '../../services/seo/jsonld.js';
import { formatPhoneDisplay } from '../../utils/phone.js';
// ============================================================================
//  src/site/pages/inner.js
// ----------------------------------------------------------------------------
//  Paginile interioare. Toate sunt funcții pure: (parc, date) → HTML.
//
//  Fiecare își construiește propriul `jsonLd`. `Layout` nu poate fi randat
//  fără head complet, deci nu există pagină fără canonical, robots și Open
//  Graph — nu pentru că îmi amintesc eu de fiecare dată, ci pentru că
//  structura nu permite altfel.
// ============================================================================

const origin = (parc) => `https://${parc.subdomain}.car-flip.com`;
const shell = (parc, preset, waUrl, current, main) => html`
${Header(parc, { current })}
<main>${main}</main>
${Footer(parc)}
${StickyWhatsapp(parc, { whatsappUrl: waUrl, preset })}`;

// ════════════════════════════════════════════════════════════════════════════
//  STOC
// ════════════════════════════════════════════════════════════════════════════

export const renderStoc = (parc, d) => {
    const preset = getPreset(parc.preset);
    const dense = preset.variants.card === 'c';
    const o = origin(parc);
    const filtered = Object.keys(d.applied || {}).length > 0;

    const main = html`
<div class="wrap">
  ${Breadcrumb([{ name: 'Acasă', path: '/' }, { name: 'Stoc mașini' }])}

  <div class="page-head">
    <h1>${d.applied?.marca
        ? `${d.applied.marca.name}${d.applied.model ? ` ${d.applied.model.name}` : ''} în ${parc.city}`
        : `Mașini de vânzare în ${parc.city}`}</h1>
    <p class="result-count">
      ${d.total} ${d.total === 1 ? 'autovehicul găsit' : 'autovehicule găsite'}
      ${d.pages > 1 ? ` · pagina ${d.page} din ${d.pages}` : ''}
    </p>
  </div>

  ${Filters({ filters: d.filters, applied: d.applied, sort: d.sort })}
  ${ActiveFilters({ applied: d.applied, query: d.query })}

  ${d.cars.length ? html`
  <div class="car-grid">
    ${d.cars.map((c, i) => CarCard(c, { dense, eager: i < 3 }))}
  </div>
  ${Pagination({ page: d.page, pages: d.pages, basePath: '/stoc', query: d.query })}
  ` : html`
  <div class="empty-state">
    <p><strong>Niciun rezultat pentru filtrele alese.</strong></p>
    <p style="margin-top:.6rem">Încearcă un interval de preț mai larg sau altă marcă.</p>
    <div class="hero-actions" style="justify-content:center;margin-top:1.4rem">
      <a class="btn btn--primary" href="/stoc">Vezi tot stocul</a>
    </div>
  </div>`}
</div>

<div style="margin-top:clamp(2.5rem,2rem + 2vw,4rem)">
  ${CtaBand(parc, { whatsappUrl: d.whatsapp_url })}
</div>`;

    return Layout({
        parc,
        path: `/stoc${qs(d.query)}`,
        meta: d.meta,
        // Paginile filtrate sunt variante ale aceleiași liste: canonical către
        // /stoc curat, ca Google să nu indexeze zeci de combinații aproape
        // identice și să dilueze semnalul paginii principale de catalog.
        canonical: filtered ? `${o}/stoc` : undefined,
        noindex: filtered,
        body: shell(parc, preset, d.whatsapp_url, 'stoc', main),
        jsonLd: [
            breadcrumbLd([{ name: 'Acasă', url: `${o}/` }, { name: 'Stoc mașini', url: `${o}/stoc` }]),
            d.cars.length ? itemListLd(d.cars, 'Stoc mașini') : null,
        ],
    });
};

// ════════════════════════════════════════════════════════════════════════════
//  PAGINA MAȘINII
// ════════════════════════════════════════════════════════════════════════════

export const renderMasina = (parc, d) => {
    const preset = getPreset(parc.preset);
    const dense = preset.variants.card === 'c';
    const o = origin(parc);
    const car = d.car;

    const badges = [
        car.registration_status,
        car.exchange_accepted ? 'Acceptă schimb' : null,
        car.for_dismante ? { warn: true, text: 'Pentru dezmembrare' } : null,
    ].filter(Boolean);

    const main = html`
<div class="wrap">
  ${Breadcrumb([
      { name: 'Acasă', path: '/' },
      { name: 'Stoc', path: '/stoc' },
      ...(d.brandPage ? [{ name: car.brand, path: `/masini/${d.brandPage}` }] : []),
      { name: `${car.name} ${car.year}` },
  ])}

  <div class="page-head">
    <h1>${car.title || `${car.name} ${car.year}`}</h1>
    <p class="result-count">${[car.year, car.mileage_fmt, car.fuel, car.transmission].filter(Boolean).join(' · ')}</p>
  </div>

  <div class="car-layout">
    <div>
      ${Gallery(car)}

      <section style="margin-top:2rem">
        <h2 style="margin-bottom:1rem">Specificații</h2>
        ${SpecTable(car)}
      </section>

      ${car.description ? html`
      <section style="margin-top:2rem">
        <h2 style="margin-bottom:1rem">Descriere</h2>
        <div class="prose"><p>${car.description}</p></div>
      </section>` : ''}
    </div>

    <aside class="car-aside">
      <div class="price-card">
        <div class="price-big">${car.price_fmt}</div>
        <p class="price-note">${car.negotiable ? 'Preț negociabil' : 'Preț fix'}</p>

        <div class="price-actions">
          <a class="btn btn--primary" href="${car.whatsapp_url}" target="_blank" rel="noopener nofollow">
            ${ICONS.whatsapp(18)} Întreabă pe WhatsApp
          </a>
          <a class="price-phone" href="tel:+${parc.phone}">
            ${ICONS.phone(17)} ${formatPhoneDisplay(parc.phone)}
          </a>
        </div>

        ${badges.length ? html`
        <div class="badge-row">
          ${badges.map((b) => typeof b === 'string'
              ? html`<span class="badge">${b}</span>`
              : html`<span class="badge badge--warn">${b.text}</span>`)}
        </div>` : ''}
      </div>

      <div class="price-card">
        <div class="info-row">
          <span class="info-ico">${ICONS.pin(18)}</span>
          <div>
            <strong>Vizionare</strong>
            <span>${parc.address}, ${parc.city}</span>
          </div>
        </div>
        <a class="btn btn--ghost" style="width:100%;margin-top:1rem" href="/contact">
          Program și hartă
        </a>
      </div>
    </aside>
  </div>

  ${d.similar?.length ? html`
  <section class="section">
    <div class="grid-head">
      <div>
        <p class="eyebrow">S-ar putea să-ți placă</p>
        <h2>Alte mașini din stocul nostru</h2>
      </div>
      <a class="btn btn--ghost" href="/stoc">Vezi tot stocul ${ICONS.arrow(16)}</a>
    </div>
    <div class="car-grid">${d.similar.map((c) => CarCard(c, { dense }))}</div>
  </section>` : ''}
</div>`;

    return Layout({
        parc,
        path: `/masina/${car.slug}`,
        meta: d.meta,
        ogImage: car.cover?.url,
        ogType: 'product',
        // Scriptul galeriei se injectează DOAR când există poze. Fără el, un
        // anunț fără media ar primi ~1,5 KB de JavaScript care nu are ce face.
        body: html`${shell(parc, preset, d.whatsapp_url, null, main)}
${car.media?.length ? html`<script>${raw(GALLERY_JS)}</script>` : ''}`,
        jsonLd: [
            vehicleLd(d.raw, parc, `${o}/masina/${car.slug}`),
            breadcrumbLd([
                { name: 'Acasă', url: `${o}/` },
                { name: 'Stoc', url: `${o}/stoc` },
                { name: `${car.name} ${car.year}`, url: `${o}/masina/${car.slug}` },
            ]),
        ],
    });
};

// ════════════════════════════════════════════════════════════════════════════
//  PAGINĂ DE MARCĂ / MODEL
// ════════════════════════════════════════════════════════════════════════════

export const renderMarca = (parc, d) => {
    const preset = getPreset(parc.preset);
    const dense = preset.variants.card === 'c';
    const o = origin(parc);
    const path = d.model ? `/masini/${d.brand.slug}/${d.model.slug}` : `/masini/${d.brand.slug}`;
    const heading = d.model
        ? `${d.brand.name} ${d.model.name} în ${parc.city}`
        : `${d.brand.name} second hand în ${parc.city}`;

    const main = html`
<div class="wrap">
  ${Breadcrumb([
      { name: 'Acasă', path: '/' },
      { name: 'Stoc', path: '/stoc' },
      ...(d.model ? [{ name: d.brand.name, path: `/masini/${d.brand.slug}` }] : []),
      { name: d.model ? d.model.name : d.brand.name },
  ])}

  <div class="page-head">
    <h1>${heading}</h1>
    <p class="lead">${d.intro}</p>
  </div>

  ${d.cars.length ? html`
  <div class="car-grid">${d.cars.map((c, i) => CarCard(c, { dense, eager: i < 3 }))}</div>
  ${Pagination({ page: d.page, pages: d.pages, basePath: path, query: d.query })}
  ` : html`<div class="empty-state"><p>Nu mai avem momentan modele disponibile aici.</p></div>`}

  ${d.siblings?.length ? html`
  <section class="section">
    <p class="eyebrow">Alte modele ${d.brand.name}</p>
    <div class="chip-row">
      ${d.siblings.map((m) => html`
      <a class="chip" href="/masini/${d.brand.slug}/${m.slug}">${m.name} <b>${m.count}</b></a>`)}
    </div>
  </section>` : ''}

  ${d.other_brands?.length ? html`
  <section class="section" style="padding-top:0">
    <p class="eyebrow">Alte mărci din stoc</p>
    <div class="chip-row">
      ${d.other_brands.map((b) => html`
      <a class="chip" href="/masini/${b.slug}">${b.name} <b>${b.count}</b></a>`)}
    </div>
  </section>` : ''}
</div>

${CtaBand(parc, { whatsappUrl: d.whatsapp_url })}`;

    return Layout({
        parc,
        path: `${path}${qs(d.query)}`,
        meta: d.meta,
        body: shell(parc, preset, d.whatsapp_url, 'stoc', main),
        jsonLd: [
            breadcrumbLd([
                { name: 'Acasă', url: `${o}/` },
                { name: 'Stoc', url: `${o}/stoc` },
                { name: d.brand.name, url: `${o}/masini/${d.brand.slug}` },
                ...(d.model ? [{ name: d.model.name, url: `${o}${path}` }] : []),
            ]),
            d.cars.length ? itemListLd(d.cars, heading) : null,
        ],
    });
};

// ════════════════════════════════════════════════════════════════════════════
//  CONTACT
// ════════════════════════════════════════════════════════════════════════════

export const renderContact = (parc, d) => {
    const preset = getPreset(parc.preset);
    const o = origin(parc);

    const main = html`
<div class="wrap">
  ${Breadcrumb([{ name: 'Acasă', path: '/' }, { name: 'Contact' }])}

  <div class="page-head">
    <h1>Contact</h1>
    ${parc.contact_intro ? html`<p class="lead">${parc.contact_intro}</p>` : ''}
  </div>

  <div class="contact-grid">
    <div class="stack">
      <div class="info-list">
        <div class="info-row">
          <span class="info-ico">${ICONS.pin(18)}</span>
          <div><strong>Adresă</strong><span>${parc.address}, ${parc.city}, ${parc.county}</span></div>
        </div>
        <div class="info-row">
          <span class="info-ico">${ICONS.phone(18)}</span>
          <div><strong>Telefon</strong><a href="tel:+${parc.phone}">${formatPhoneDisplay(parc.phone)}</a></div>
        </div>
        <div class="info-row">
          <span class="info-ico">${ICONS.whatsapp(18)}</span>
          <div><strong>WhatsApp</strong>
            <a href="${d.whatsapp_url}" target="_blank" rel="noopener nofollow">Scrie-ne direct</a></div>
        </div>
        ${parc.email ? html`
        <div class="info-row">
          <span class="info-ico">${ICONS.arrow(18)}</span>
          <div><strong>Email</strong><a href="mailto:${parc.email}">${parc.email}</a></div>
        </div>` : ''}
      </div>

      <div style="margin-top:1.4rem">
        <h2 style="margin-bottom:.9rem;font-size:1.1rem">${ICONS.clock(16)} Program</h2>
        ${Hours(parc)}
      </div>

      <div class="hero-actions" style="margin-top:1.4rem">
        <a class="btn btn--primary" href="${d.whatsapp_url}" target="_blank" rel="noopener nofollow">
          ${ICONS.whatsapp(18)} Scrie pe WhatsApp
        </a>
        <a class="btn btn--ghost" href="tel:+${parc.phone}">${ICONS.phone(17)} Sună acum</a>
      </div>
    </div>

    <div>${MapBlock(parc)}</div>
  </div>

  <section class="section">
    <div class="section-head">
      <p class="eyebrow">Despre noi</p>
      <h2>${parc.about_title || 'Cine suntem'}</h2>
    </div>
    <div class="prose"><p>${d.about_text}</p></div>
  </section>
</div>`;

    return Layout({
        parc,
        path: '/contact',
        meta: d.meta,
        body: shell(parc, preset, d.whatsapp_url, 'contact', main),
        jsonLd: [
            autoDealerLd(parc, { total: d.total }),
            breadcrumbLd([{ name: 'Acasă', url: `${o}/` }, { name: 'Contact', url: `${o}/contact` }]),
            faqLd(parc, { total: d.total, brands: d.brands || [] }),
        ],
    });
};

// ════════════════════════════════════════════════════════════════════════════
//  PAGINI LEGALE
// ════════════════════════════════════════════════════════════════════════════

export const renderLegal = (parc, slug, d) => {
    const preset = getPreset(parc.preset);
    const o = origin(parc);
    const doc = getLegalDoc(slug, parc);
    if (!doc) return null;

    const main = html`
<div class="wrap">
  ${Breadcrumb([{ name: 'Acasă', path: '/' }, { name: doc.title }])}
  <div class="page-head"><h1>${doc.title}</h1></div>
  <div class="prose" style="padding-bottom:3rem">${doc.content}</div>
</div>`;

    return Layout({
        parc,
        path: `/${slug}`,
        meta: {
            title: `${doc.title} — ${parc.display_name}`,
            description: `${doc.title} pentru site-ul ${parc.display_name}, ${parc.city}.`,
        },
        body: shell(parc, preset, d.whatsapp_url, null, main),
        jsonLd: [breadcrumbLd([
            { name: 'Acasă', url: `${o}/` },
            { name: doc.title, url: `${o}/${slug}` },
        ])],
    });
};

// ════════════════════════════════════════════════════════════════════════════
//  404 ÎN INTERIORUL SITE-ULUI
// ════════════════════════════════════════════════════════════════════════════

/**
 * Mult mai bun decât o pagină de eroare goală: păstrează header, footer și
 * navigație, și oferă mașini reale în loc de un drum înfundat.
 *
 * Motivul practic: cea mai frecventă cauză a unui 404 aici e un anunț șters
 * după ce a fost dat pe Facebook. Vizitatorul a venit pentru o mașină anume;
 * dacă îi arăți altele patru din stoc, o parte rămân.
 */
export const renderNotFound = (parc, d) => {
    const preset = getPreset(parc.preset);
    const dense = preset.variants.card === 'c';

    const main = html`
<div class="wrap nf">
  <div class="nf-code">404</div>
  <h1>Pagina nu a fost găsită</h1>
  <p class="lead">
    Anunțul căutat a fost probabil vândut sau retras. Mai jos sunt câteva
    dintre mașinile disponibile acum.
  </p>
  <div class="hero-actions">
    <a class="btn btn--primary" href="/stoc">Vezi tot stocul</a>
    <a class="btn btn--ghost" href="/">Înapoi acasă</a>
  </div>
</div>

${d.cars?.length ? html`
<div class="wrap" style="padding-bottom:3rem">
  <div class="car-grid">${d.cars.map((c) => CarCard(c, { dense }))}</div>
</div>` : ''}`;

    return Layout({
        parc,
        path: '/404',
        meta: {
            title: `Pagină indisponibilă — ${parc.display_name}`,
            description: 'Anunțul căutat nu mai este disponibil.',
        },
        noindex: true,
        body: shell(parc, preset, d.whatsapp_url, null, main),
    });
};

export default {
    renderStoc, renderMasina, renderMarca, renderContact, renderLegal, renderNotFound,
};
