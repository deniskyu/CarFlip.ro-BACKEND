import { html } from '../html.js';
import { Layout } from '../layout.js';
import { getPreset } from '../presets.js';
import { Header, Hero, CarCard, cardVariant, Services, CtaBand, Footer, StickyWhatsapp, ICONS } from '../components.js';
import { autoDealerLd, breadcrumbLd, itemListLd } from '../../services/seo/jsonld.js';

// ============================================================================
//  src/site/pages/home.js
// ----------------------------------------------------------------------------
//  Pagina de acasă. Funcție PURĂ: primește `parc` și obiectul întors de
//  `/api/site/home`, întoarce HTML. Fără acces la baza de date, fără `req`.
//
//  Datorită asta poate fi randată cu date fabricate și inspectată — ceea ce
//  am și făcut înainte de livrare.
//
//  ── ORDINEA SECȚIUNILOR ───────────────────────────────────────────────────
//  hero → mașini → servicii → despre → contact
//
//  Mașinile vin ÎNAINTEA serviciilor deliberat. Omul a intrat pe un site de
//  parc auto ca să vadă mașini; „garanție 12 luni" e argument de închidere,
//  nu de deschidere. Dacă primul lucru sub banner e text despre firmă, o parte
//  din vizitatori pleacă înainte să vadă un singur automobil.
// ============================================================================

export const renderHome = (parc, data) => {
    const preset = getPreset(parc.preset);
    // Litera de variantă pentru card vine din presetare (a/b/c/d).
    const cv = cardVariant(preset);
    const origin = `https://${parc.subdomain}.car-flip.com`;

    const cars = Array.isArray(data.latest) ? data.latest : [];
    const brands = Array.isArray(data.top_brands) ? data.top_brands : [];

    const body = html`
${Header(parc, { current: 'home', preset })}

<main>
  ${Hero(parc, { total: data.total, preset, filters: data.filters })}

  <!-- ── Ultimele mașini ────────────────────────────────────────────── -->
  <section class="section">
    <div class="wrap">
      <div class="grid-head">
        <div>
          <p class="eyebrow">Ultimele intrări</p>
          <h2>Mașini adăugate recent</h2>
        </div>
        ${data.total > cars.length
            ? html`<a class="btn btn--ghost" href="/stoc">Vezi toate cele ${data.total} ${ICONS.arrow(16)}</a>`
            : ''}
      </div>

      ${cars.length ? html`
      <div class="car-grid">
        ${cars.map((c, i) => CarCard(c, { variant: cv, eager: i < 2 }))}
      </div>` : html`
      <div class="empty-state">
        <p>Stocul se actualizează. Revino în curând sau scrie-ne pe WhatsApp — s-ar putea să avem exact ce cauți.</p>
      </div>`}

      ${brands.length > 1 ? html`
      <div style="margin-top:2rem">
        <p class="eyebrow">Caută după marcă</p>
        <div class="chip-row">
          ${brands.map((b) => html`
          <a class="chip" href="/masini/${b.slug}">${b.name} <b>${b.count}</b></a>`)}
        </div>
      </div>` : ''}
    </div>
  </section>

  ${Services(parc, { preset })}

  <!-- ── Despre noi ─────────────────────────────────────────────────── -->
  <section class="section">
    <div class="wrap">
      <div class="section-head">
        <p class="eyebrow">Despre noi</p>
        <h2>${parc.about_title || 'Cine suntem'}</h2>
      </div>
      <p class="lead">${data.about_text}</p>
      <div class="hero-actions" style="margin-top:1.6rem">
        <a class="btn btn--primary" href="/contact">${ICONS.pin(17)} Vezi unde ne găsești</a>
      </div>
    </div>
  </section>

  ${CtaBand(parc, { whatsappUrl: data.whatsapp_url })}
</main>

${Footer(parc, { preset })}
${StickyWhatsapp(parc, { whatsappUrl: data.whatsapp_url, preset })}`;

    return Layout({
        parc,
        path: '/',
        meta: data.meta,
        ogImage: parc.banner_url,
        body,
        jsonLd: [
            autoDealerLd(parc, { total: data.total }),
            breadcrumbLd([{ name: 'Acasă', url: `${origin}/` }]),
            cars.length ? itemListLd(cars, 'Mașini adăugate recent') : null,
        ],
    });
};

export default { renderHome };
