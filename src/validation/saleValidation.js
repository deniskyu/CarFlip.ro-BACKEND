// ============================================================================
//  src/validation/saleValidation.js   — SINCRONIZAT CU APLICAȚIA MOBILĂ
// ----------------------------------------------------------------------------
//  Regulile de validare ale unui anunț, într-un singur loc.
//
//  ⚠️ TOATE LISTELE DE MAI JOS SUNT COPIATE LITERAL DIN `AddSaleScreen.jsx`.
//  Nu sunt „echivalente", sunt IDENTICE, caracter cu caracter.
//
//  ── DE CE CONTEAZĂ ATÂT DE MULT ───────────────────────────────────────────
//  Anunțurile din aplicație și cele din panoul dealerului ajung în ACEEAȘI
//  colecție și se afișează pe ACELAȘI site. Dacă aplicația scrie „Sedan" și
//  panoul scrie „Berlină", filtrul de pe site le arată ca două caroserii
//  diferite. Dealerul filtrează după una și jumătate din stoc dispare, fără
//  nicio explicație vizibilă.
//
//  La fel pentru `registration_status`: aplicația salvează valorile brute
//  `'registered'` / `'unregistered'`, nu etichetele afișate. Un panou care
//  scrie „Înmatriculat" produce o a treia valoare, incompatibilă cu ambele.
//
//  Când modifici o listă în `AddSaleScreen.jsx`, modific-o și aici. Nu există
//  sursă comună — aplicația e alt proiect.
// ============================================================================

import { COUNTIES, isValidLocation } from './locations.js';

export const LIMITS = {
    TITLE: 35,
    DESCRIPTION: 1500,
    HORSEPOWER_DIGITS: 4,
    VIN: 17,
    PHONE_DIGITS: 10,
    MAX_FILES: 13,
    MAX_VIDEOS: 1,
    MAX_IMAGE_BYTES: 15 * 1024 * 1024,
    MAX_VIDEO_BYTES: 50 * 1024 * 1024,
};

// ─── Capacitate cilindrică ──────────────────────────────────────────────────
// NU e text liber. În aplicație e un select generat programatic:
//   „Fără (Electric)", apoi 0.6 L … 7.4 L, din 0.1 în 0.1 (69 de valori).
// Generat identic aici, ca panoul să ofere exact aceleași opțiuni.
export const ENGINE_CAPACITIES = [{ id: 'electric', name: 'Fără (Electric)' }];
for (let i = 6; i <= 74; i++) {
    const val = (i / 10).toFixed(1);
    ENGINE_CAPACITIES.push({ id: val, name: `${val} L` });
}

export const OPTIONS = {
    // Copiat literal din FUEL_TYPES (staticData.js). Zece valori, nu cinci.
    // „Hibrid" simplu NU există — sunt două intrări separate, pe combustibil.
    fuel: ['Benzină', 'Motorină', 'Electric', 'Hibrid Benzină', 'Hibrid Motorină',
           'Hidrogen', 'Benzină + GPL', 'Etanol', 'Lpg', 'Altceva'],

    capacity: ENGINE_CAPACITIES.map((c) => c.name),

    body: ['Sedan', 'SUV', 'Hatchback', 'Break (Combi)', 'Coupe', 'Cabrio', 'Minivan', 'Pick-up', 'Van'],

    color: ['Alb', 'Negru', 'Gri', 'Argintiu', 'Albastru', 'Roșu', 'Verde',
            'Galben', 'Maro', 'Portocaliu', 'Bej', 'Auriu', 'Alta culoare'],

    transmission: ['Manuală', 'Automată'],

    pollution: ['Non-Euro', 'Euro 1', 'Euro 2', 'Euro 3', 'Euro 4', 'Euro 5',
                'Euro 6', 'Hibrid', 'Electric'],

    drivetrain: ['Față (FWD)', 'Spate (RWD)', 'Integrală (4x4/AWD)'],

    // ⚠️ Valori BRUTE, nu etichete. Aplicația salvează exact aceste șiruri.
    registration: [
        { v: 'registered', l: 'Înmatriculat' },
        { v: 'unregistered', l: 'Neînmatriculat' },
    ],

    steering: [{ v: 'left', l: 'Stânga' }, { v: 'right', l: 'Dreapta' }],
};

export const sanitize = (text) => (text ? String(text).trim() : '');

const num = (v) => {
    const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
};

/** Lista de valori acceptate pentru un câmp, indiferent dacă e string sau {v,l}. */
const values = (list) => list.map((o) => (typeof o === 'string' ? o : o.v));

const REQUIRED = [
    ['brand_id', 'Marca'], ['brand_name', 'Marca'],
    ['model_id', 'Modelul'], ['model_name', 'Modelul'],
    ['engine_capacity', 'Capacitatea motorului'], ['engine_fuel', 'Combustibilul'],
    ['price', 'Prețul'], ['mileage', 'Kilometrajul'], ['production_year', 'Anul fabricației'],
    ['body_type', 'Caroseria'], ['color', 'Culoarea'], ['transmission', 'Cutia de viteze'],
    ['drivetrain', 'Tracțiunea'], ['pollution_standard', 'Norma de poluare'],
    ['county', 'Județul'], ['city', 'Orașul'], ['registration_status', 'Starea înmatriculării'],
    ['phone_number', 'Telefonul'], ['description', 'Descrierea'], ['title', 'Titlul'],
];

/**
 * Validează câmpurile unui anunț.
 * @returns {{ ok: boolean, errors: string[], data?: object }}
 */
export const validateSaleFields = (b = {}) => {
    const errors = [];

    for (const [key, label] of REQUIRED) {
        if (!b[key] || !String(b[key]).trim()) errors.push(`${label} este obligatoriu/obligatorie.`);
    }
    if (errors.length) return { ok: false, errors };

    const title = sanitize(b.title);
    if (title.length > LIMITS.TITLE) {
        errors.push(`Titlul este prea lung. Maxim ${LIMITS.TITLE} de caractere permise.`);
    }
    const description = sanitize(b.description);
    if (description.length > LIMITS.DESCRIPTION) {
        errors.push(`Descrierea este prea lungă. Limita maximă este de ${LIMITS.DESCRIPTION} de caractere.`);
    }

    const price = num(b.price);
    const mileage = num(b.mileage);
    const year = num(b.production_year);
    const currentYear = new Date().getFullYear();

    if (price === null || price <= 0) errors.push('Prețul trebuie să fie un număr pozitiv.');
    if (mileage === null || mileage < 0) errors.push('Kilometrajul trebuie să fie un număr.');
    if (year === null || year < 1950 || year > currentYear + 1) {
        errors.push(`Anul fabricației trebuie să fie între 1950 și ${currentYear + 1}.`);
    }

    const inList = (val, list, label) => {
        if (!values(list).includes(sanitize(val))) errors.push(`${label} are o valoare nevalidă.`);
    };
    inList(b.engine_fuel, OPTIONS.fuel, 'Combustibilul');
    inList(b.engine_capacity, OPTIONS.capacity, 'Capacitatea motorului');
    inList(b.body_type, OPTIONS.body, 'Caroseria');
    inList(b.transmission, OPTIONS.transmission, 'Cutia de viteze');
    inList(b.drivetrain, OPTIONS.drivetrain, 'Tracțiunea');
    inList(b.pollution_standard, OPTIONS.pollution, 'Norma de poluare');
    inList(b.registration_status, OPTIONS.registration, 'Starea înmatriculării');
    inList(b.color, OPTIONS.color, 'Culoarea');

    // ── Județ + oraș, verificate ÎMPREUNĂ ───────────────────────────────────
    // Verificate separat, „Craiova, Cluj" ar trece — ambele există, dar perechea
    // e inexistentă. `location.county` intră în indexul feed-ului și în JSON-LD
    // ca `addressRegion`; o valoare greșită scoate anunțul din toate filtrele.
    const county = sanitize(b.county);
    const city = sanitize(b.city);
    if (!COUNTIES.includes(county)) {
        errors.push('Județul nu este valid.');
    } else if (!isValidLocation(county, city)) {
        errors.push(`Orașul „${city}" nu aparține județului ${county}.`);
    }

    // ── Coerența electric ───────────────────────────────────────────────────
    // În aplicație, alegerea unuia îl setează automat pe celălalt. Panoul face
    // la fel prin JavaScript, dar serverul verifică independent: cineva care
    // manipulează formularul din DevTools nu poate strecura o mașină electrică
    // cu motor de 2.0 L.
    const isElectricFuel = sanitize(b.engine_fuel) === 'Electric';
    const isElectricCap = sanitize(b.engine_capacity) === 'Fără (Electric)';
    if (isElectricFuel !== isElectricCap) {
        errors.push('Pentru combustibil electric, capacitatea trebuie să fie „Fără (Electric)" — și invers.');
    }

    if (errors.length) return { ok: false, errors };

    const hp = num(b.horsepower);
    const vin = b.vin ? sanitize(b.vin).toUpperCase().slice(0, LIMITS.VIN) : '';

    return {
        ok: true,
        errors: [],
        data: {
            title,
            description,
            brand: { id: Number(b.brand_id), name: sanitize(b.brand_name) },
            model: { id: Number(b.model_id), name: sanitize(b.model_name) },
            engine: { capacity: sanitize(b.engine_capacity), fuel_type: sanitize(b.engine_fuel) },
            price,
            mileage,
            production_year: year,
            horsepower: hp && hp > 0 ? String(hp).slice(0, LIMITS.HORSEPOWER_DIGITS) : undefined,
            body_type: sanitize(b.body_type),
            color: sanitize(b.color),
            transmission: sanitize(b.transmission),
            drivetrain: sanitize(b.drivetrain),
            pollution_standard: sanitize(b.pollution_standard),
            steering_wheel: b.steering_wheel === 'right' ? 'right' : 'left',
            location: { county: sanitize(b.county), city: sanitize(b.city) },
            registration_status: sanitize(b.registration_status),
            exchange_accepted: String(b.exchange_accepted) === 'true' || b.exchange_accepted === 'on',
            for_dismante: String(b.for_dismante) === 'true' || b.for_dismante === 'on',
            negotiable: String(b.negotiable) === 'true' || b.negotiable === 'on',
            vin,
            phone_number: sanitize(b.phone_number),
        },
    };
};

/**
 * Validează fișierele primite prin multer.
 * Aceleași limite ca în aplicație: 13 fișiere, 1 video, 15MB/imagine, 50MB/video,
 * și obligatoriu cel puțin o FOTOGRAFIE (videoclipurile sunt opționale).
 */
export const validateSaleFiles = (files = []) => {
    const errors = [];

    if (!Array.isArray(files) || files.length === 0) {
        return { ok: false, errors: ['Este necesară cel puțin o fotografie.'] };
    }
    if (files.length > LIMITS.MAX_FILES) {
        errors.push(`Maxim ${LIMITS.MAX_FILES} fișiere permise.`);
    }

    let videos = 0;
    let images = 0;
    for (const f of files) {
        const isVideo = String(f.mimetype || '').startsWith('video/');
        const isImage = String(f.mimetype || '').startsWith('image/');
        if (isVideo) {
            videos++;
            if (videos > LIMITS.MAX_VIDEOS) errors.push(`Maxim ${LIMITS.MAX_VIDEOS} videoclip permis.`);
            if (f.size > LIMITS.MAX_VIDEO_BYTES) errors.push('Un fișier video depășește limita de 50MB.');
        } else if (isImage) {
            images++;
            if (f.size > LIMITS.MAX_IMAGE_BYTES) errors.push('O imagine depășește limita de 15MB.');
        } else {
            errors.push('Format neacceptat. Doar foto/video.');
        }
    }
    if (images === 0) errors.push('Este necesară cel puțin o fotografie (videoclipurile sunt opționale).');

    return { ok: errors.length === 0, errors: [...new Set(errors)] };
};

export default { LIMITS, OPTIONS, ENGINE_CAPACITIES, sanitize, validateSaleFields, validateSaleFiles };
