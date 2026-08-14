// ============================================================================
//  scripts/seedDemoParc.js
// ----------------------------------------------------------------------------
//  Creează parcul de prezentare `demo.car-flip.com`, cu mașini reale.
//
//  RULARE:
//    node scripts/seedDemoParc.js
//    node scripts/seedDemoParc.js --sub=demo --cars=14 --preset=1
//    node scripts/seedDemoParc.js --reset      ← șterge anunțurile demo și le refac
//    node scripts/seedDemoParc.js --delete     ← șterge tot (parc + anunțuri demo)
//
//  ── DE CE CLONEAZĂ ANUNȚURI REALE ─────────────────────────────────────────
//  Un demo cu poze placeholder gri nu spune nimic despre cum arată site-ul.
//  Diferența dintre un card cu o fotografie adevărată de mașină și unul cu un
//  dreptunghi gri e uriașă — iar demo-ul ăsta e materialul cu care vinzi.
//
//  Scriptul alege anunțuri active DIVERSE (mărci diferite, prețuri diferite) și
//  le clonează pe contul demo. Zero upload, zero stocare în plus: pozele există
//  deja în R2.
//
//  ── SIGURANȚA CARE FACE ASTA POSIBIL ──────────────────────────────────────
//  La clonare, `public_id` este ȘTERS din fiecare element media.
//
//  Fără asta, ștergerea unui anunț demo ar șterge din R2 fotografiile
//  ANUNȚULUI ORIGINAL — pentru că `public_id` e cheia din R2, iar codul de
//  ștergere o folosește direct. Un dealer real ar rămâne fără poze la un anunț
//  pe care nici nu l-a atins.
//
//  Cu `public_id` absent, codul existent sare peste ștergere (`if (file.public_id)`),
//  iar anunțurile demo doar afișează aceleași URL-uri publice.
//
//  ── ȘI PROMOVAREA SOCIALĂ ─────────────────────────────────────────────────
//  `allow_social_promo: false` plus starea `skipped` pe ambele platforme.
//  Altfel dispecerul ar publica mașini fictive pe pagina ta de Facebook și pe
//  TikTok, la câteva minute după rulare.
// ============================================================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import parcuri from '../src/models/parcModel.js';
import users from '../src/models/userModel.js';
import sales from '../src/models/salesModel.js';
import { generateSaleSlug } from '../src/utils/slug.js';
import { addMonths, addDays } from 'date-fns';

const arg = (n, d = null) => {
    const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
    return hit ? hit.split('=').slice(1).join('=') : d;
};
const flag = (n) => process.argv.includes(`--${n}`);

const SUB = (arg('sub', 'demo') || 'demo').toLowerCase();
const WANT = Math.max(4, Math.min(24, Number(arg('cars', 14)) || 14));
const PRESET = Math.max(0, Math.min(5, Number(arg('preset', 0)) || 0));
const DEMO_USERNAME = arg('user', 'carflip_demo');
const RESET = flag('reset');
const DELETE = flag('delete');

const line = (s = '') => console.log(s);

const DEMO_PARC = {
    display_name: 'Parc Auto Meridian',
    preset: PRESET,
    accent_color: '#800000',
    hero_title: 'Mașini verificate, fără surprize',
    hero_subtitle: 'Fiecare autoturism din stoc trece printr-o verificare tehnică completă înainte să ajungă în ofertă.',
    about_title: 'Despre noi',
    about_text: 'Parc Auto Meridian funcționează din 2011 în Craiova. Aducem autoturisme rulate din Germania și Belgia, cu istoric de service verificabil și kilometraj confirmat. Fiecare mașină ajunge în ofertă doar după o verificare tehnică completă în service-ul propriu.\nNu lucrăm cu mașini avariate structural și nu vindem nimic ce nu am cumpăra noi înșine.',
    contact_intro: 'Ne găsești de luni până sâmbătă. Vino la o vizionare sau scrie-ne pe WhatsApp — răspundem repede.',
    phone: '0761930497',
    whatsapp: '0761930497',
    email: 'contact@meridian-auto.ro',
    address: 'Calea București 145',
    city: 'Craiova',
    county: 'Dolj',
    lat: 44.3212,
    lng: 23.8256,
    schedule: [
        { day: 1, open: '09:00', close: '18:00', closed: false },
        { day: 2, open: '09:00', close: '18:00', closed: false },
        { day: 3, open: '09:00', close: '18:00', closed: false },
        { day: 4, open: '09:00', close: '18:00', closed: false },
        { day: 5, open: '09:00', close: '18:00', closed: false },
        { day: 6, open: '09:00', close: '14:00', closed: false },
        { day: 0, open: '09:00', close: '14:00', closed: true },
    ],
    company_name: 'MERIDIAN AUTO GRUP SRL',
    company_cui: 'RO28451903',
    company_reg: 'J16/842/2011',
    company_address: 'Calea București 145, Craiova, Dolj',
    services_title: 'Ce oferim',
    services: [
        { icon: 'shield', title: 'Garanție 12 luni',
          text: 'Toate mașinile din stoc vin cu garanție scrisă pentru motor și cutia de viteze.' },
        { icon: 'card', title: 'Finanțare în aceeași zi',
          text: 'Lucrăm cu șase bănci. Afli în 30 de minute dacă ești eligibil, fără drum la bancă.' },
        { icon: 'swap', title: 'Preluăm mașina ta',
          text: 'Evaluare gratuită și preluare în schimb, cu plata diferenței pe loc.' },
    ],
    seo_keywords: [
        'mașini second hand Craiova', 'auto rulate Dolj', 'parc auto Craiova',
        'mașini verificate Craiova', 'rate fără avans Craiova',
    ],
    seo_service_area: ['Craiova', 'Filiași', 'Segarcea', 'Băilești', 'Calafat', 'Slatina'],
    founded_year: 2011,
    notes: 'PARC DEMO — creat cu scripts/seedDemoParc.js. Anunțurile sunt clone ale unor anunțuri reale, cu public_id eliminat.',
};

const run = async () => {
    await mongoose.connect(process.env.DB_URL);
    line('✅ Conectat la MongoDB');

    // ── Utilizatorul demo ───────────────────────────────────────────────────
    let demoUser = await users.findOne({ username: DEMO_USERNAME });

    if (DELETE) {
        if (demoUser) {
            const r = await sales.deleteMany({ user_id: demoUser._id });
            line(`🗑️  ${r.deletedCount} anunțuri demo șterse (fără atingerea R2 — nu au public_id)`);
        }
        const p = await parcuri.deleteOne({ subdomain: SUB });
        line(p.deletedCount ? `🗑️  Parcul "${SUB}" șters.` : `ℹ️  Nu există parcul "${SUB}".`);
        line(`⚠️  Golește cache-ul: redis-cli DEL parc:sub:${SUB}`);
        await mongoose.disconnect();
        process.exit(0);
    }

    if (!demoUser) {
        demoUser = await users.create({
            username: DEMO_USERNAME,
            email: `${DEMO_USERNAME}@car-flip.com`,
            isVerified: true,
        });
        line(`👤 Cont demo creat: ${DEMO_USERNAME}`);
    } else {
        line(`👤 Cont demo existent: ${DEMO_USERNAME}`);
    }

    if (RESET) {
        const r = await sales.deleteMany({ user_id: demoUser._id });
        line(`♻️  ${r.deletedCount} anunțuri demo vechi șterse`);
    }

    const already = await sales.countDocuments({ user_id: demoUser._id });
    const need = Math.max(0, WANT - already);

    if (need === 0) {
        line(`ℹ️  Contul demo are deja ${already} anunțuri. Folosește --reset ca să le refaci.`);
    } else {
        // ── Alegem anunțuri sursă DIVERSE ───────────────────────────────────
        // Grupăm după marcă și luăm cel mult 2 per marcă, ca demo-ul să arate
        // un stoc variat, nu opt Logan-uri. Cerem doar anunțuri cu minim 3 poze.
        const pool = await sales.aggregate([
            { $match: {
                user_id: { $ne: demoUser._id },
                is_active: true,
                'media.2': { $exists: true },     // minim 3 elemente media
                description: { $exists: true, $ne: '' },
            }},
            { $sample: { size: 400 } },
            { $group: { _id: '$brand.id', docs: { $push: '$$ROOT' } } },
            { $project: { docs: { $slice: ['$docs', 2] } } },
            { $unwind: '$docs' },
            { $replaceRoot: { newRoot: '$docs' } },
            { $limit: need },
        ]);

        if (pool.length === 0) {
            console.error('❌ Nu am găsit anunțuri active cu cel puțin 3 poze de clonat.');
            await mongoose.disconnect();
            process.exit(1);
        }

        const now = new Date();
        const paidUntil = addMonths(now, 24);   // demo-ul nu trebuie să expire
        const created = [];

        for (const src of pool) {
            const _id = new mongoose.Types.ObjectId();

            // ⚠️ `public_id` ELIMINAT — vezi comentariul din capul fișierului.
            const media = (src.media || []).map((m) => ({
                url: m.url,
                type: m.type,
                zoom_level: m.zoom_level,
                width: m.width,
                height: m.height,
                cover_fraction: m.cover_fraction,
            }));

            const doc = {
                _id,
                user_id: demoUser._id,
                user_name: DEMO_PARC.display_name,
                user_image: src.user_image,
                title: src.title,
                brand: src.brand,
                model: src.model,
                engine: src.engine,
                price: src.price,
                negotiable: src.negotiable,
                mileage: src.mileage,
                production_year: src.production_year,
                horsepower: src.horsepower,
                body_type: src.body_type,
                color: src.color,
                transmission: src.transmission,
                drivetrain: src.drivetrain,
                pollution_standard: src.pollution_standard,
                steering_wheel: src.steering_wheel,
                location: { county: DEMO_PARC.county, city: DEMO_PARC.city },
                registration_status: src.registration_status,
                exchange_accepted: src.exchange_accepted,
                for_dismante: false,
                phone_number: DEMO_PARC.phone,
                description: src.description,
                media,
                vin: '',                          // nu copiem VIN-ul unei mașini reale
                likes_count: 0, liked_by: [], comments_count: 0, views: 0,
                allow_comments: false,
                allow_social_promo: false,        // demo-ul NU se postează pe social
                social_promo: {
                    facebook: { status: 'skipped', last_error: 'Anunț demo' },
                    tiktok: { status: 'skipped', last_error: 'Anunț demo' },
                },
                is_active: true,
                status: 'active',
                paid_until: paidUntil,
                expires_at: addDays(paidUntil, 10),
            };
            doc.slug = generateSaleSlug(doc);
            created.push(doc);
        }

        // insertMany NU declanșează hook-ul pre('save') — de aceea slug-ul e
        // generat explicit mai sus, pentru fiecare document.
        await sales.insertMany(created, { ordered: false });
        line(`🚗 ${created.length} anunțuri demo create (clone, fără public_id)`);
    }

    // ── Parcul ──────────────────────────────────────────────────────────────
    const existing = await parcuri.findOne({ user_id: demoUser._id });
    const firstCar = await sales.findOne({ user_id: demoUser._id, 'media.0.url': { $exists: true } })
        .select('media').lean();
    const img = firstCar?.media?.[0]?.url || 'https://media.car-flip.com/splash_logo.jpg';

    const parcDoc = {
        ...DEMO_PARC,
        subdomain: SUB,
        user_id: demoUser._id,
        active: true,
        logo_url: 'https://media.car-flip.com/splash_logo.jpg',
        logo_public_id: 'placeholder_logo_demo',
        banner_url: img,
        banner_public_id: 'placeholder_banner_demo',
    };

    let parc;
    if (existing) {
        parc = await parcuri.findOneAndUpdate(
            { _id: existing._id }, { $set: parcDoc },
            { new: true, runValidators: true }
        );
        line(`♻️  Parc actualizat: ${SUB}`);
    } else {
        parc = await parcuri.create(parcDoc);
        line(`✨ Parc creat: ${SUB}`);
    }

    const total = await sales.countDocuments({ user_id: demoUser._id, is_active: true });
    const brands = await sales.distinct('brand.name', { user_id: demoUser._id, is_active: true });

    line();
    line('══════════════════════════════════════════════════');
    line(`  ${parc.display_name}`);
    line(`  https://${SUB}.car-flip.com`);
    line(`  ${total} mașini · ${brands.length} mărci: ${brands.slice(0, 6).join(', ')}`);
    line(`  Presetare #${parc.preset} · accent ${parc.accent_color}`);
    line('══════════════════════════════════════════════════');
    line();
    line('  Compară toate cele 6 presetări:');
    line(`    https://${SUB}.car-flip.com/_presetari`);
    line();
    line('  Sau una singură, direct:');
    line(`    https://${SUB}.car-flip.com/?__preset=3`);
    line();
    line('  ⚠️ Logo-ul și bannerul sunt provizorii. Înlocuiește-le din panoul');
    line('     de admin cu imagini reale înainte de a arăta demo-ul unui client.');
    line();

    await mongoose.disconnect();
    process.exit(0);
};

run().catch((err) => {
    console.error('❌ Eroare:', err.message);
    if (err.errors) for (const [k, e] of Object.entries(err.errors)) console.error(`   • ${k}: ${e.message}`);
    process.exit(1);
});
