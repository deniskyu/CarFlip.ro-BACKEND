// ============================================================================
//  src/services/seo/jsonld.js
// ----------------------------------------------------------------------------
//  Date structurate schema.org. Sunt cel mai ieftin câștig SEO din tot
//  proiectul: se generează din câmpuri pe care le avem deja și schimbă felul
//  în care Google AFIȘEAZĂ rezultatul, nu doar unde îl poziționează.
//
//  Concret, ce obține dealerul:
//   • AutoDealer  → program, adresă și telefon direct în rezultatele Google
//   • Vehicle+Offer → preț, an și kilometraj vizibile în listă
//   • FAQPage     → întrebări extinse care ocupă spațiu suplimentar în SERP
//   • Breadcrumb  → calea în loc de URL-ul brut sub titlu
//
//  Toate funcțiile curăță câmpurile goale înainte de a întoarce obiectul:
//  o proprietate cu `null` sau `""` produce avertisment în Search Console.
// ============================================================================

const DAY_URI = [
    'https://schema.org/Sunday',
    'https://schema.org/Monday',
    'https://schema.org/Tuesday',
    'https://schema.org/Wednesday',
    'https://schema.org/Thursday',
    'https://schema.org/Friday',
    'https://schema.org/Saturday',
];

/** Elimină recursiv cheile goale — Search Console se plânge de ele. */
const prune = (obj) => {
    if (Array.isArray(obj)) {
        const arr = obj.map(prune).filter((v) => v !== undefined);
        return arr.length ? arr : undefined;
    }
    if (obj && typeof obj === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
            const p = prune(v);
            if (p !== undefined) out[k] = p;
        }
        return Object.keys(out).length ? out : undefined;
    }
    if (obj === null || obj === '' || obj === undefined) return undefined;
    if (typeof obj === 'number' && !Number.isFinite(obj)) return undefined;
    return obj;
};

const origin = (parc) => `https://${parc.subdomain}.car-flip.com`;

// ════════════════════════════════════════════════════════════════════════════

export const autoDealerLd = (parc, filters) => {
    const base = origin(parc);

    const hours = (parc.schedule || [])
        .filter((d) => !d.closed && d.open && d.close)
        .map((d) => ({
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: DAY_URI[Number(d.day)] || undefined,
            opens: d.open,
            closes: d.close,
        }));

    const sameAs = [parc.facebook_url, parc.instagram_url, parc.tiktok_url].filter(Boolean);

    return prune({
        '@context': 'https://schema.org',
        '@type': 'AutoDealer',
        '@id': `${base}/#dealer`,
        name: parc.display_name,
        legalName: parc.company_name,
        url: base,
        image: parc.banner_url,
        logo: parc.logo_url,
        description: parc.hero_subtitle || undefined,
        telephone: parc.phone ? `+${parc.phone}` : undefined,
        email: parc.email || undefined,
        foundingDate: parc.founded_year ? String(parc.founded_year) : undefined,
        address: {
            '@type': 'PostalAddress',
            streetAddress: parc.address,
            addressLocality: parc.city,
            addressRegion: parc.county,
            addressCountry: 'RO',
        },
        geo: (Number.isFinite(parc.lat) && Number.isFinite(parc.lng)) ? {
            '@type': 'GeoCoordinates',
            latitude: parc.lat,
            longitude: parc.lng,
        } : undefined,
        openingHoursSpecification: hours,
        // Localitățile din jur: prind căutări unde competiția e aproape zero.
        areaServed: (parc.seo_service_area || []).map((a) => ({ '@type': 'City', name: a })),
        sameAs: sameAs.length ? sameAs : undefined,
        currenciesAccepted: 'EUR',
        makesOffer: filters?.total
            ? { '@type': 'Offer', itemOffered: { '@type': 'Car' }, availability: 'https://schema.org/InStock' }
            : undefined,
    });
};

export const vehicleLd = (sale, parc, absoluteUrl) => {
    const base = origin(parc);
    const name = [sale.brand?.name, sale.model?.name, sale.production_year].filter(Boolean).join(' ');
    const images = (sale.media || [])
        .filter((m) => m.type === 'image' && m.url)
        .slice(0, 8)
        .map((m) => m.url);

    return prune({
        '@context': 'https://schema.org',
        '@type': 'Vehicle',
        name,
        url: absoluteUrl,
        image: images.length ? images : undefined,
        description: sale.description || undefined,
        brand: sale.brand?.name ? { '@type': 'Brand', name: sale.brand.name } : undefined,
        model: sale.model?.name || undefined,
        vehicleModelDate: sale.production_year ? String(sale.production_year) : undefined,
        productionDate: sale.production_year ? String(sale.production_year) : undefined,
        vehicleIdentificationNumber: sale.vin || undefined,
        mileageFromOdometer: Number.isFinite(sale.mileage)
            ? { '@type': 'QuantitativeValue', value: sale.mileage, unitCode: 'KMT' }
            : undefined,
        fuelType: sale.engine?.fuel_type || undefined,
        vehicleTransmission: sale.transmission || undefined,
        bodyType: sale.body_type || undefined,
        color: sale.color || undefined,
        driveWheelConfiguration: sale.drivetrain || undefined,
        vehicleEngine: (sale.engine?.capacity || sale.horsepower) ? prune({
            '@type': 'EngineSpecification',
            engineDisplacement: sale.engine?.capacity
                ? { '@type': 'QuantitativeValue', value: sale.engine.capacity, unitCode: 'CMQ' }
                : undefined,
            enginePower: sale.horsepower
                ? { '@type': 'QuantitativeValue', value: sale.horsepower, unitCode: 'BHP' }
                : undefined,
            fuelType: sale.engine?.fuel_type || undefined,
        }) : undefined,
        steeringPosition: sale.steering_wheel === 'right'
            ? 'https://schema.org/RightHandDriving'
            : 'https://schema.org/LeftHandDriving',
        offers: {
            '@type': 'Offer',
            '@id': `${absoluteUrl}#offer`,
            url: absoluteUrl,
            price: Number.isFinite(sale.price) ? sale.price : undefined,
            priceCurrency: 'EUR',
            availability: 'https://schema.org/InStock',
            itemCondition: 'https://schema.org/UsedCondition',
            seller: { '@id': `${base}/#dealer` },
        },
    });
};

export const breadcrumbLd = (items) => prune({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: it.name,
        item: it.url,
    })),
});

export const itemListLd = (cars, listName) => prune({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: cars.length,
    itemListElement: cars.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: c.url,
        name: c.name || c.title,
    })),
});

/**
 * FAQ generat din datele parcului.
 *
 * Ieftin de produs și ocupă spațiu suplimentar în rezultatele Google. Toate
 * răspunsurile sunt reale, compuse din câmpuri existente — nu inventăm nimic,
 * ceea ce ar fi și împotriva regulilor Google pentru date structurate.
 */
export const faqLd = (parc, filters) => {
    const openDays = (parc.schedule || []).filter((d) => !d.closed);
    const dayNames = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
    const hoursText = openDays.length
        ? openDays.map((d) => `${dayNames[Number(d.day)]} ${d.open}–${d.close}`).join(', ')
        : null;

    const qa = [];

    if (hoursText) {
        qa.push({
            q: `Care este programul de lucru la ${parc.display_name}?`,
            a: `Suntem deschiși ${hoursText}. Pentru vizionare în afara programului, scrie-ne pe WhatsApp la +${parc.whatsapp}.`,
        });
    }

    qa.push({
        q: `Unde se află ${parc.display_name}?`,
        a: `Ne găsești în ${parc.address}, ${parc.city}, județul ${parc.county}. Pagina de contact are hartă și indicații.`,
    });

    if (filters?.total) {
        const brands = (filters.brands || []).slice(0, 5).map((b) => b.name).join(', ');
        qa.push({
            q: `Câte mașini aveți în stoc?`,
            a: `În acest moment avem ${filters.total} ${filters.total === 1 ? 'mașină disponibilă' : 'mașini disponibile'}${brands ? `, printre care ${brands}` : ''}. Stocul se actualizează zilnic.`,
        });
    }

    // Întrebări generate DOAR din serviciile pe care dealerul chiar le-a declarat.
    for (const s of (parc.services || []).slice(0, 3)) {
        if (s?.title && s?.text) qa.push({ q: `${s.title}?`, a: s.text });
    }

    if (qa.length < 2) return null;

    return prune({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: qa.map((x) => ({
            '@type': 'Question',
            name: x.q,
            acceptedAnswer: { '@type': 'Answer', text: x.a },
        })),
    });
};

/** Serializare sigură pentru <script type="application/ld+json">. */
export const ldToScript = (obj) => {
    if (!obj) return '';
    // `</script>` în interiorul unui string ar închide tag-ul devreme și ar
    // permite injectare de HTML. Escapăm slash-ul din secvența de închidere.
    return JSON.stringify(obj).replace(/</g, '\\u003c');
};

export default { autoDealerLd, vehicleLd, breadcrumbLd, itemListLd, faqLd, ldToScript };
