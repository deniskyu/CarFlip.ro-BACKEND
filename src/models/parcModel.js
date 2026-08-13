import mongoose from "mongoose";
import { validateSubdomain } from "../utils/reservedSubdomains.js";
import { normalizePhone } from "../utils/phone.js";

// ============================================================================
//  src/models/parcModel.js   →   colecția 'parcuri'
// ----------------------------------------------------------------------------
//  Un document = un site de parc auto, servit pe <subdomain>.car-flip.com.
//
//  Ce NU ține acest model: anunțurile. Ele rămân în colecția `sales`, legate
//  de `user_id`. Site-ul nu are copie proprie a stocului — la fiecare afișare
//  interoghează { user_id: parc.user_id, is_active: true }. De aceea
//  sincronizarea dintre aplicație și site e instantanee și bidirecțională prin
//  construcție: nu există stare de sincronizat, deci nimic nu poate rămâne
//  desincronizat.
//
//  Documentul ăsta e citit la FIECARE request către un subdomeniu, deci se
//  cache-uiește în Redis (vezi Batch 2 — src/services/parcCache.js). Ține-l
//  mic și evită să adaugi aici câmpuri care cresc nelimitat.
// ============================================================================

// ─── Program de funcționare ─────────────────────────────────────────────────
// Array structurat, nu text liber, pentru că e nevoie de el în două locuri cu
// cerințe diferite: afișarea din pagina de contact ȘI `openingHoursSpecification`
// din JSON-LD (Google îl citește și îl arată direct în rezultate).
const scheduleDaySchema = new mongoose.Schema({
    day:    { type: Number, min: 0, max: 6, required: true }, // 0 = Duminică ... 6 = Sâmbătă
    open:   { type: String, default: '09:00' },
    close:  { type: String, default: '18:00' },
    closed: { type: Boolean, default: false },
}, { _id: false });

const defaultSchedule = () => ([
    { day: 1, open: '09:00', close: '18:00', closed: false },
    { day: 2, open: '09:00', close: '18:00', closed: false },
    { day: 3, open: '09:00', close: '18:00', closed: false },
    { day: 4, open: '09:00', close: '18:00', closed: false },
    { day: 5, open: '09:00', close: '18:00', closed: false },
    { day: 6, open: '09:00', close: '14:00', closed: false },
    { day: 0, open: '09:00', close: '14:00', closed: true  },
]);

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const trimTo = (max) => ({
    type: String,
    trim: true,
    maxlength: [max, `Textul depășește limita de ${max} de caractere.`],
});

const parcSchema = new mongoose.Schema({

    // ─── Identitate și rutare ───────────────────────────────────────────────
    subdomain: {
        type: String,
        required: [true, 'Subdomeniul este obligatoriu.'],
        unique: true,
        lowercase: true,
        trim: true,
        validate: {
            validator: (v) => validateSubdomain(v).valid,
            message: (props) => validateSubdomain(props.value).error || 'Subdomeniu invalid.',
        },
    },

    // Se completează abia la upsell-ul cu domeniu propriu (Cloudflare for SaaS).
    // Câmpul există de acum pentru că adăugarea lui mai târziu ar însemna
    // rescrierea rutării, nu doar un câmp în plus.
    custom_domain: { type: String, default: null, lowercase: true, trim: true },

    // Contul din aplicație al dealerului. Unic → garantează la nivel de DB
    // regula „un cont per parc", nu doar la nivel de aplicație.
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true,
        unique: true,
    },

    // Stinge site-ul instant (404) fără să șteargă nimic. Butonul folosit în
    // ~95% din cazuri când un client pleacă.
    active:    { type: Boolean, default: true },

    // Gardul anti-fermă-de-subdomenii. Vezi src/services/indexableCheck.js
    // (Batch 3). NICIODATĂ setat manual pe true — se recalculează automat.
    indexable: { type: Boolean, default: false },

    // ─── Branding (obligatoriu la creare) ───────────────────────────────────
    display_name: {
        type: String,
        required: [true, 'Numele afișat este obligatoriu.'],
        trim: true,
        maxlength: [40, 'Numele afișat poate avea maxim 40 de caractere.'],
    },
    logo_url:         { type: String, required: true, trim: true },
    logo_public_id:   { type: String, required: true, trim: true }, // cheie PLATĂ în R2
    banner_url:       { type: String, required: true, trim: true },
    banner_public_id: { type: String, required: true, trim: true }, // cheie PLATĂ în R2

    // Presetarea de design (0-5). Determină header, hero, card, footer, paletă,
    // fonturi, spațiere, radius ȘI setul de animații — ca un tot unitar.
    preset: {
        type: Number,
        required: true,
        min: 0,
        max: 5,
        validate: {
            validator: Number.isInteger,
            message: 'Presetarea trebuie să fie un număr întreg între 0 și 5.',
        },
    },

    // Se alege dintr-o listă pre-validată per presetare, nu dintr-un picker
    // liber — altfel apar combinații ilizibile (text negru pe maro închis).
    accent_color: {
        type: String,
        required: true,
        trim: true,
        validate: { validator: (v) => HEX_COLOR.test(v), message: 'Culoare invalidă. Format: #RRGGBB.' },
    },

    // ─── Conținut editabil ──────────────────────────────────────────────────
    // Limitele NU sunt aceleași cu cele din salesModel — sunt calculate ca
    // textul să încapă în layout la 360px lățime. Un hero_title de 35 de
    // caractere (ca `title` la anunț) ar fi prea scurt; unul de 1500 (ca
    // `description`) ar sparge bannerul.
    hero_title:    trimTo(60),
    hero_subtitle: trimTo(140),
    about_title:   trimTo(60),
    about_text:    trimTo(1200),
    contact_intro: trimTo(300),

    // ─── Contact ────────────────────────────────────────────────────────────
    phone: {
        type: String,
        required: true,
        trim: true,
        set: normalizePhone, // 0761 930 497 → 40761930497
    },
    // Normalizat obligatoriu: wa.me acceptă DOAR format internațional fără plus.
    // Un număr salvat ca "0761930497" produce un buton WhatsApp mort.
    whatsapp: {
        type: String,
        required: true,
        trim: true,
        set: normalizePhone,
        validate: {
            validator: (v) => /^\d{10,15}$/.test(v || ''),
            message: 'Număr WhatsApp invalid (format internațional, ex. 40761930497).',
        },
    },
    email:   { type: String, trim: true, lowercase: true },
    address: { type: String, required: true, trim: true, maxlength: 160 },
    city:    { type: String, required: true, trim: true, maxlength: 60 },
    county:  { type: String, required: true, trim: true, maxlength: 60 },

    // Necesare pentru harta din pagina de contact ȘI pentru `geo` din JSON-LD.
    lat: { type: Number, required: true, min: -90,  max: 90  },
    lng: { type: Number, required: true, min: -180, max: 180 },

    schedule: { type: [scheduleDaySchema], default: defaultSchedule },

    // ─── Social (opțional) ──────────────────────────────────────────────────
    facebook_url:  { type: String, trim: true },
    instagram_url: { type: String, trim: true },
    tiktok_url:    { type: String, trim: true },

    // ─── Date de firmă (obligatorii legal) ──────────────────────────────────
    // Site-ul vinde bunuri către consumatori → intră sub obligațiile de comerț
    // electronic. Apar DOAR în footer, cu font mic, și în paginile legale.
    // Sunt informații publice; se pot completa fără dealer, dar se confirmă cu
    // el ca să nu apară sediul unei firme cu nume similar.
    company_name:    { type: String, required: true, trim: true, maxlength: 120 },
    company_cui:     { type: String, required: true, trim: true, maxlength: 20  },
    company_reg:     { type: String, required: true, trim: true, maxlength: 30  }, // J16/1234/2020
    company_address: { type: String, required: true, trim: true, maxlength: 200 },

    // ─── SEO ────────────────────────────────────────────────────────────────
    // ATENȚIE: astea NU produc un meta tag `keywords`. Tag-ul ăla e ignorat de
    // Google din 2009. Cuvintele cheie alimentează GENERAREA DE CONȚINUT REAL:
    // variantele de hero_subtitle, paragraful din „Despre noi" când dealerul
    // nu-l scrie, intro-urile paginilor de marcă, compunerea meta description,
    // și textele alternative ale imaginilor.
    seo_keywords: {
        type: [String],
        default: [],
        validate: {
            validator: (arr) => Array.isArray(arr) && arr.length <= 8 && arr.every(k => typeof k === 'string' && k.trim().length > 0 && k.length <= 60),
            message: 'Maxim 8 cuvinte cheie, fiecare de maxim 60 de caractere.',
        },
    },
    // Localitățile din jur. Ajung într-o frază naturală din „Despre noi" ȘI în
    // `areaServed` din JSON-LD. Prind căutări din localitățile satelit, unde
    // competiția e aproape zero.
    seo_service_area: {
        type: [String],
        default: [],
        validate: {
            validator: (arr) => Array.isArray(arr) && arr.length <= 10,
            message: 'Maxim 10 localități.',
        },
    },
    founded_year: {
        type: Number,
        min: 1900,
        max: 2100,
        validate: {
            validator: (v) => v === undefined || v === null || Number.isInteger(v),
            message: 'Anul înființării trebuie să fie un număr întreg.',
        },
    },
    meta_description: trimTo(160), // override opțional pentru pagina de home

    // ─── Note interne ───────────────────────────────────────────────────────
    // NU apar niciodată public. Filtrate explicit de toPublicJSON().
    notes: { type: String, trim: true, maxlength: 2000 },

}, {
    timestamps: true,
    collection: 'parcuri',
    minimize: false,
});

// ─── Indecși ────────────────────────────────────────────────────────────────
// `subdomain` și `user_id` primesc index unic din `unique: true` de mai sus.
//
// `custom_domain` NU poate folosi `unique: true` cu `sparse: true`, pentru că
// sparse ignoră doar câmpurile ABSENTE, nu și pe cele cu valoarea null. Cum
// avem `default: null`, câmpul EXISTĂ pe fiecare document → al doilea parc ar
// arunca duplicate key error. Soluția e partialFilterExpression pe tip string
// — exact tiparul folosit deja în userModel pentru googleId / appleId.
parcSchema.index(
    { custom_domain: 1 },
    { unique: true, partialFilterExpression: { custom_domain: { $type: 'string' } } }
);
parcSchema.index({ active: 1 });

// ─── Metode ─────────────────────────────────────────────────────────────────

/**
 * Forma trimisă către front-end și pusă în cache-ul Redis.
 * Scoate câmpurile interne. Orice câmp nou care nu trebuie să ajungă public
 * TREBUIE adăugat aici, nu filtrat prin rute.
 */
parcSchema.methods.toPublicJSON = function () {
    const o = this.toObject({ virtuals: false });
    delete o.notes;
    delete o.__v;
    delete o.createdAt;
    delete o.updatedAt;
    return o;
};

/** Varianta pentru obiecte lean (fără document Mongoose), folosită de cache. */
parcSchema.statics.toPublic = function (lean) {
    if (!lean) return null;
    const o = { ...lean };
    delete o.notes;
    delete o.__v;
    delete o.createdAt;
    delete o.updatedAt;
    return o;
};

parcSchema.statics.findBySubdomain = function (sub) {
    if (typeof sub !== 'string' || !sub.trim()) return null;
    return this.findOne({ subdomain: sub.trim().toLowerCase() });
};

const parcuri = mongoose.models.parcuri || mongoose.model("parcuri", parcSchema);
export default parcuri;
