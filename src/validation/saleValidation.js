// ============================================================================
//  src/validation/saleValidation.js
// ----------------------------------------------------------------------------
//  Regulile de validare ale unui anunț, într-un singur loc.
//
//  Sunt IDENTICE cu cele din `/api/sale/post/free`: titlu ≤35, descriere ≤1500,
//  max 13 fișiere, max 1 video, imagine ≤15MB, video ≤50MB, aceleași câmpuri
//  obligatorii, aceeași sanitizare.
//
//  ── DE CE UN FIȘIER SEPARAT ───────────────────────────────────────────────
//  Dealerul postează din două locuri: aplicația mobilă și panoul web. Dacă
//  fiecare ar avea propriile reguli, ar devia la prima modificare — iar
//  dealerul ar descoperi că un titlu acceptat în aplicație e respins pe web.
//
//  ⚠️ Ruta existentă `/api/sale/post/free` NU e modificată în acest batch.
//  Regulile de acolo sunt copiate fidel aici. Refactorizarea ei ca să folosească
//  acest fișier e opțională și e descrisă la finalul documentului de instalare
//  — deliberat separată, pentru că atinge exact calea care s-a rupt o dată.
// ============================================================================

export const LIMITS = {
    TITLE: 35,
    DESCRIPTION: 1500,
    MAX_FILES: 13,
    MAX_VIDEOS: 1,
    MAX_IMAGE_BYTES: 15 * 1024 * 1024,
    MAX_VIDEO_BYTES: 50 * 1024 * 1024,
};

// ─── Liste de opțiuni ───────────────────────────────────────────────────────
// Folosite ȘI la randarea formularului, ȘI la validare. O opțiune adăugată aici
// apare automat în select și devine automat acceptată de server.
export const OPTIONS = {
    fuel: ['Benzină', 'Motorină', 'Hibrid', 'Hibrid plug-in', 'Electric', 'GPL', 'Benzină + GPL'],
    body: ['Berlină', 'Break', 'Hatchback', 'SUV', 'Coupe', 'Cabrio', 'Monovolum', 'Pick-up', 'Off-road'],
    transmission: ['Manuală', 'Automată', 'Semi-automată'],
    drivetrain: ['Față', 'Spate', 'Integrală (4x4)'],
    pollution: ['Non-euro', 'Euro 1', 'Euro 2', 'Euro 3', 'Euro 4', 'Euro 5', 'Euro 6', 'Euro 6d'],
    registration: ['Înmatriculat', 'Neînmatriculat', 'Înmatriculat provizoriu'],
    color: ['Alb', 'Negru', 'Gri', 'Argintiu', 'Albastru', 'Roșu', 'Verde', 'Maro', 'Bej', 'Galben', 'Portocaliu', 'Vișiniu', 'Alta'],
    steering: [{ v: 'left', l: 'Stânga' }, { v: 'right', l: 'Dreapta' }],
};

export const sanitize = (text) => (text ? String(text).trim() : '');

const num = (v) => {
    const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
};

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
 * Validează câmpurile unui anunț nou.
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

    // Opțiunile din liste: acceptăm doar valori cunoscute. Un select manipulat
    // din DevTools nu poate strecura gunoi în baza de date.
    const inList = (val, list, label) => {
        if (!list.includes(sanitize(val))) errors.push(`${label} are o valoare nevalidă.`);
    };
    inList(b.engine_fuel, OPTIONS.fuel, 'Combustibilul');
    inList(b.body_type, OPTIONS.body, 'Caroseria');
    inList(b.transmission, OPTIONS.transmission, 'Cutia de viteze');
    inList(b.drivetrain, OPTIONS.drivetrain, 'Tracțiunea');
    inList(b.pollution_standard, OPTIONS.pollution, 'Norma de poluare');
    inList(b.registration_status, OPTIONS.registration, 'Starea înmatriculării');
    inList(b.color, OPTIONS.color, 'Culoarea');

    if (errors.length) return { ok: false, errors };

    const hp = num(b.horsepower);

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
            horsepower: hp && hp > 0 ? hp : undefined,
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
            vin: b.vin ? sanitize(b.vin).toUpperCase() : '',
            phone_number: sanitize(b.phone_number),
        },
    };
};

/**
 * Validează fișierele primite prin multer.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export const validateSaleFiles = (files = []) => {
    const errors = [];

    if (!Array.isArray(files) || files.length === 0) {
        return { ok: false, errors: ['Este necesar cel puțin un fișier media (poză/video).'] };
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
    if (images === 0) errors.push('Este necesară cel puțin o imagine.');

    return { ok: errors.length === 0, errors: [...new Set(errors)] };
};

export default { LIMITS, OPTIONS, sanitize, validateSaleFields, validateSaleFiles };
