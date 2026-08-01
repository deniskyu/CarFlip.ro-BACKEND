const APP_URL = 'https://car-flip.com';

const fmt = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return '';
    return new Intl.NumberFormat('de-DE').format(num);
};

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');

const buildFacts = (sale) => {
    const brand = sale.brand?.name || '';
    const model = sale.model?.name || '';
    const name = [brand, model].filter(Boolean).join(' ').trim();

    const city = sale.location?.city || '';
    const county = sale.location?.county || '';

    return {
        name: name || 'Autoturism',
        title: (sale.title || name || 'Autoturism').trim(),
        year: sale.production_year ? String(sale.production_year) : '',
        price: Number.isFinite(Number(sale.price)) ? `${fmt(sale.price)} €` : '',
        negotiable: sale.negotiable === true,
        km: Number.isFinite(Number(sale.mileage)) ? `${fmt(sale.mileage)} km` : '',
        fuel: cap(sale.engine?.fuel_type || ''),
        capacity: sale.engine?.capacity || '',
        hp: sale.horsepower ? `${sale.horsepower} CP` : '',
        transmission: cap(sale.transmission || ''),
        body: cap(sale.body_type || ''),
        color: cap(sale.color || ''),
        drivetrain: sale.drivetrain ? String(sale.drivetrain).toUpperCase() : '',
        pollution: cap(sale.pollution_standard || ''),
        county,
        city,
        location: [city, county].filter(Boolean).join(', '),
        dismantle: sale.for_dismante === true,
        registered: sale.registration_status === 'registered',
    };
};

const joinParts = (parts, sep = ' · ') => parts.filter(p => p && String(p).trim()).join(sep);

const HASHTAGS = [
    '#masinidevanzare #carflip #autoromania',
    '#masini #anunturiauto #carflip',
    '#autoromania #masinasecondhand #carflip',
    '#carflip #masinidevanzare #auto',
];

const TEMPLATES = [
    (f) => [
        `📍 ${f.location || 'România'}`,
        '',
        f.title,
        joinParts([f.year, f.km, f.fuel, f.capacity, f.hp]),
        joinParts([f.transmission, f.body, f.color, f.drivetrain, f.pollution]),
        '',
        joinParts([f.price, f.negotiable ? 'negociabil' : 'preț fix']),
    ],
    (f) => [
        `📍 ${f.city || f.county || 'România'}`,
        '',
        `${f.name} din ${f.year || 'stoc'} — ${f.price}`,
        joinParts([f.km, f.fuel, f.hp, f.transmission]),
        joinParts([f.body, f.color, f.pollution]),
    ],
    (f) => [
        `📍 ${f.location || 'România'}`,
        '',
        f.title,
        '',
        `An: ${f.year}`,
        `Rulaj: ${f.km}`,
        `Motor: ${joinParts([f.capacity, f.fuel, f.hp])}`,
        `Cutie: ${f.transmission}`,
        `Preț: ${f.price}${f.negotiable ? ' (negociabil)' : ''}`,
    ],
    (f) => [
        `📍 ${f.city || f.county || 'România'}`,
        '',
        `${f.price} — ${f.name} ${f.year}`,
        joinParts([f.km, f.fuel, f.capacity, f.hp, f.transmission]),
        joinParts([f.body, f.color, f.drivetrain]),
    ],
    (f) => [
        `📍 ${f.location || 'România'}`,
        '',
        f.title,
        joinParts([f.year, f.fuel, f.hp, f.transmission, f.body]),
        joinParts([f.km, f.pollution, f.registered ? 'înmatriculat' : 'neînmatriculat']),
        '',
        `${f.price}${f.negotiable ? ' · negociabil' : ''}`,
    ],
    (f) => [
        `📍 ${f.location || 'România'}`,
        '',
        `${f.name} ${f.year} · ${f.km}`,
        joinParts([f.capacity, f.fuel, f.hp]),
        joinParts([f.transmission, f.drivetrain, f.body, f.color]),
        '',
        `${f.price}${f.negotiable ? ', negociabil' : ''}`,
    ],
];

const pickIndex = (saleId, arrayLength) => {
    const s = String(saleId || '');
    let sum = 0;
    for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
    return sum % arrayLength;
};

const cleanLines = (lines) => lines
    .map(l => (l === '' ? '' : String(l).trim()))
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const buildCaptions = (sale) => {
    const f = buildFacts(sale);
    const idx = pickIndex(sale._id, TEMPLATES.length);
    const body = cleanLines(TEMPLATES[idx](f));
    const tags = HASHTAGS[pickIndex(sale._id, HASHTAGS.length)];

    const dismantleNote = f.dismantle ? '\n⚠️ Vândut pentru dezmembrare' : '';

    const facebookCaption = `${body}${dismantleNote}\n\nMai multe anunțuri în aplicația CarFlip.`;

    const facebookFirstComment = `Descarcă aplicația CarFlip: ${APP_URL}`;

    const rawTitle = f.title.replace(/https?:\/\/\S+/g, '').replace(/#\S+/g, '').trim();
    const titleWithCity = f.city ? `${f.city} · ${rawTitle}` : rawTitle;
    const tiktokTitle = titleWithCity.length > 88 ? `${titleWithCity.slice(0, 87)}…` : titleWithCity;

    const tiktokDescription = `${body}${dismantleNote}\n\nCaută-l în aplicația CarFlip.\n\n${tags}`;

    return {
        facebookCaption: facebookCaption.slice(0, 60000),
        facebookFirstComment,
        tiktokTitle: tiktokTitle || 'Anunț auto',
        tiktokDescription: tiktokDescription.slice(0, 3900),
    };
};
