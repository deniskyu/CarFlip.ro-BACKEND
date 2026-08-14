import mongoose from "mongoose";
import { generateSaleSlug } from "../utils/slug.js";

const socialPlatformState = {
    status: {
        type: String,
        enum: ['pending', 'posting', 'posted', 'failed', 'skipped', 'unknown'],
        default: 'pending'
    },
    zernio_post_id: { type: String, default: null },
    posted_at: { type: Date, default: null },
    claimed_at: { type: Date, default: null },
    retry_after: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    temp_failures: { type: Number, default: 0 },
    revivals: { type: Number, default: 0 },
    last_error: { type: String, default: null },
};

const saleSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users', 
        required: true
    },
    user_name: { type: String },
    user_image: { type: String },
    title: { type: String, required: true, maxlength: 35 },
    slug: { type: String, trim: true, lowercase: true },
    brand: {
        id: { type: Number, required: true },
        name: { type: String, required: true }
    },
    model: {
        id: { type: Number, required: true },
        name: { type: String, required: true }
    },
    engine: {
        capacity: { type: String, required: true },
        fuel_type: { type: String, required: true }
    },
    price: { type: Number, required: true },
    negotiable: { type: Boolean, default: false },
    mileage: { type: Number, required: true },
    production_year: { type: Number, required: true },
    vin: { type: String },
    horsepower: { type: Number },
    body_type: { type: String, required: true },
    color: { type: String, required: true },
    transmission: { type: String, required: true },
    drivetrain: { type: String, required: true },
    pollution_standard: { type: String, required: true },
    steering_wheel: { type: String, enum: ['left', 'right'], default: 'left' },
    location: {
        county: { type: String, required: true },
        city: { type: String, required: true },
    },
    registration_status: { type: String, required: true },
    exchange_accepted: { type: Boolean, default: false },
    for_dismante: { type: Boolean, default: false },
    phone_number: { type: String, required: true },
    description: { type: String, default: "" },
    media: [
        {
            url: { type: String, required: true },
            type: { type: String, enum: ['image', 'video'], default: 'image' },
            public_id: { type: String },
            zoom_level: { type: Number, default: 1 },
            width: { type: Number },
            height: { type: Number },
            cover_fraction: { type: Number }
        }
    ],
    likes_count: { type: Number, default: 0 },
    liked_by: [{ 
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
        liked_at: { type: Date, default: Date.now }
    }],
    allow_comments: { type: Boolean, default: true },
    allow_social_promo: { type: Boolean, default: false },
    social_promo: {
        facebook: socialPlatformState,
        tiktok: socialPlatformState,
    },
    comments_count: { type: Number, default: 0 },
    is_active: { type: Boolean, default: false },
    is_promoted: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    status: { 
        type: String, 
        enum: ['pending_payment', 'active', 'grace_period', 'media_processing', 'failed_media'], 
        default: 'pending_payment' 
    },
    paid_until: { type: Date },
    expires_at: { type: Date },
    stripe_subscription_id: { type: String, default: null }
}, { 
    timestamps: true,
    collection: 'sales' 
});

saleSchema.index({ "brand.id": 1 });
saleSchema.index({ "model.id": 1 });
saleSchema.index({ price: 1 });
saleSchema.index({ production_year: -1 });
saleSchema.index({ "location.county": 1 });
saleSchema.index({ status: 1 });
saleSchema.index({ expires_at: 1 });
//saleSchema.index({ steering_wheel: 1 });
//saleSchema.index({ negotiable: 1 });
saleSchema.index({ is_active: 1, _id: -1 }); // ← pentru feed (query principal)
saleSchema.index({ user_id: 1, _id: -1 });   // ← pentru my-posts
saleSchema.index({ user_id: 1, status: 1 }); // ← pentru banner-ul "anunțuri în procesare" (my-posts)
saleSchema.index({ "liked_by.user_id": 1 });  // ← pentru liked aggregation
saleSchema.index({ is_active: 1, likes_count: -1, _id: -1 }); // ← pentru search
saleSchema.index({ is_active: 1, "location.county": 1, _id: -1 }); // ← pentru Tier A (feed pe județ)
saleSchema.index({ "social_promo.facebook.posted_at": -1 });
saleSchema.index({ "social_promo.tiktok.posted_at": -1 });
saleSchema.index({ allow_social_promo: 1, is_active: 1, status: 1, "social_promo.facebook.status": 1, createdAt: 1 });
saleSchema.index({ allow_social_promo: 1, is_active: 1, status: 1, "social_promo.tiktok.status": 1, createdAt: 1 });
saleSchema.index({ slug: 1 }, { unique: true, sparse: true });

// Catalogul unui dealer, sortat. Indexul { user_id: 1, _id: -1 } există deja
// mai sus și acoperă sortarea implicită („cele mai noi"), deci nu se repetă.
saleSchema.index({ user_id: 1, is_active: 1, price: 1 });            // sortare după preț
saleSchema.index({ user_id: 1, is_active: 1, production_year: -1 }); // sortare după an
saleSchema.index({ user_id: 1, is_active: 1, mileage: 1 });          // sortare


// ─── Generarea automată a slug-ului ─────────────────────────────────────────
// Rulează la prima salvare a fiecărui anunț nou, indiferent din ce rută vine.
// De aceea NU e nevoie să atingi userActions.js pentru asta.
//
// ⚠️ FĂRĂ parametrul `next`. Mongoose 9 / Kareem 3.3 au eliminat complet
// middleware-ul pe bază de callback: `execPre` e async și apelează hook-ul cu
// argumentele operației, fără să injecteze vreun callback. O semnătură
// `function (next)` primește `undefined` și aruncă „next is not a function".
//
// Un hook sincron cu arietate 0 e stilul corect: Kareem îl apelează, vede că
// nu întoarce o promisiune și continuă imediat.
//
// Condiția `if (this.slug) return` face hook-ul inofensiv la orice re-salvare
// a unui anunț existent: slug-ul rămâne exact cum a fost generat prima dată,
// deci URL-urile deja indexate de Google și cele date pe Facebook nu se rup.
saleSchema.pre('save', function () {
    if (this.slug) return;
    try {
        this.slug = generateSaleSlug(this);
    } catch (err) {
        // Nu blocăm postarea unui anunț dacă slug-ul nu se poate genera.
        // Anunțul intră fără slug, iar backfill-ul îl prinde la următoarea rulare.
        console.warn(`⚠️ Nu am putut genera slug pentru anunț: ${err.message}`);
    }
});


const sales = mongoose.models.sales || mongoose.model("sales", saleSchema);
export default sales;
