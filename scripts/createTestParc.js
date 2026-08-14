// ============================================================================
//  scripts/createTestParc.js
// ----------------------------------------------------------------------------
//  Creează un parc de test valid, ca să poți verifica rutarea din Batch 2 fără
//  să compui manual un document cu ~25 de câmpuri obligatorii.
//
//  RULARE:
//    node scripts/createTestParc.js
//    node scripts/createTestParc.js --sub=bogdan --user=numele_userului
//    node scripts/createTestParc.js --sub=bogdan --preset=3
//    node scripts/createTestParc.js --sub=bogdan --delete
//
//  Fără --user, alege automat utilizatorul cu CELE MAI MULTE anunțuri active.
//  Așa pagina de test arată imediat un stoc real, nu zero.
//
//  ⚠️ Datele sunt fictive, în afară de user_id. Logo-ul și bannerul sunt luate
//     din prima poză a unui anunț real al userului, ca să vezi cum arată cu
//     imagini adevărate. Ștergerea parcului NU atinge anunțurile.
// ============================================================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import parcuri from '../src/models/parcModel.js';
import users from '../src/models/userModel.js';
import sales from '../src/models/salesModel.js';

const arg = (name, fallback = null) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const SUB = (arg('sub', 'test') || 'test').toLowerCase();
const USER = arg('user');
const PRESET = Number(arg('preset', 0)) || 0;
const DELETE = flag('delete');

const line = (s = '') => console.log(s);

const run = async () => {
    await mongoose.connect(process.env.DB_URL);
    line('✅ Conectat la MongoDB');

    // ── Ștergere ────────────────────────────────────────────────────────────
    if (DELETE) {
        const r = await parcuri.deleteOne({ subdomain: SUB });
        line(r.deletedCount
            ? `🗑️  Parcul "${SUB}" a fost șters. Anunțurile NU au fost atinse.`
            : `ℹ️  Nu există niciun parc cu subdomeniul "${SUB}".`);
        line('⚠️  Cache-ul Redis expiră în maxim 5 minute, sau: redis-cli DEL parc:sub:' + SUB);
        await mongoose.disconnect();
        process.exit(0);
    }

    // ── Alegem utilizatorul ─────────────────────────────────────────────────
    let user;
    if (USER) {
        user = await users.findOne({
            $or: [{ username: USER }, { email: String(USER).toLowerCase() }],
        }).lean();
        if (!user) {
            console.error(`❌ Nu am găsit utilizatorul "${USER}".`);
            await mongoose.disconnect();
            process.exit(1);
        }
    } else {
        const [top] = await sales.aggregate([
            { $match: { is_active: true } },
            { $group: { _id: '$user_id', n: { $sum: 1 } } },
            { $sort: { n: -1 } },
            { $limit: 1 },
        ]);
        if (!top) {
            console.error('❌ Nu există niciun anunț activ în baza de date. Dă --user=<username>.');
            await mongoose.disconnect();
            process.exit(1);
        }
        user = await users.findById(top._id).lean();
        line(`👤 Utilizator ales automat: ${user.username} (${top.n} anunțuri active)`);
    }

    const existing = await parcuri.findOne({ user_id: user._id }).lean();
    if (existing && existing.subdomain !== SUB) {
        console.error(`❌ Utilizatorul "${user.username}" are deja parcul "${existing.subdomain}".`);
        console.error('   Un cont = un parc. Șterge-l întâi sau folosește alt utilizator.');
        await mongoose.disconnect();
        process.exit(1);
    }

    // ── Imagini reale din stocul lui, ca pagina de test să arate credibil ───
    const withMedia = await sales
        .findOne({ user_id: user._id, is_active: true, 'media.0.url': { $exists: true } })
        .select('media').lean();

    const FALLBACK = 'https://media.car-flip.com/splash_logo.jpg';
    const img = withMedia?.media?.[0]?.url || FALLBACK;

    const doc = {
        subdomain: SUB,
        user_id: user._id,
        active: true,
        indexable: false,               // se activează automat abia în Batch 3

        display_name: 'Parc Auto Test',
        logo_url: img,
        logo_public_id: 'placeholder_logo',
        banner_url: img,
        banner_public_id: 'placeholder_banner',
        preset: Math.max(0, Math.min(5, PRESET)),
        accent_color: '#800000',

        hero_title: 'Mașini verificate, fără surprize',
        hero_subtitle: 'Peste 15 ani de experiență în vânzarea de autoturisme rulate.',
        about_title: 'Despre noi',
        about_text: 'Suntem un parc auto de familie din Craiova. Fiecare mașină din stocul nostru este verificată tehnic înainte de a ajunge în ofertă, iar istoricul de kilometraj este confirmat.',
        contact_intro: 'Ne găsești de luni până sâmbătă. Te așteptăm la o vizită sau scrie-ne pe WhatsApp.',

        phone: '0761930497',            // setter-ul îl normalizează la 40761930497
        whatsapp: '0761930497',
        email: 'contact@example.ro',
        address: 'Strada Caracal 123',
        city: 'Craiova',
        county: 'Dolj',
        lat: 44.3302,
        lng: 23.7949,

        company_name: 'AUTO TEST SRL',
        company_cui: 'RO12345678',
        company_reg: 'J16/1234/2020',
        company_address: 'Strada Caracal 123, Craiova, Dolj',

        seo_keywords: [
            'mașini second hand Craiova',
            'auto rulate Dolj',
            'parc auto Craiova',
            'mașini verificate',
        ],
        seo_service_area: ['Craiova', 'Filiași', 'Segarcea', 'Băilești', 'Calafat'],
        founded_year: 2009,

        notes: 'Parc de test creat cu scripts/createTestParc.js — poate fi șters oricând.',
    };

    let parc;
    if (existing) {
        parc = await parcuri.findOneAndUpdate(
            { subdomain: SUB },
            { $set: doc },
            { new: true, runValidators: true }
        );
        line(`♻️  Parc actualizat: ${SUB}`);
    } else {
        parc = await parcuri.create(doc);
        line(`✨ Parc creat: ${SUB}`);
    }

    const stoc = await sales.countDocuments({ user_id: user._id, is_active: true });

    line();
    line('══════════════════════════════════════════════════');
    line(`  Subdomeniu:   ${parc.subdomain}.car-flip.com`);
    line(`  Utilizator:   ${user.username}`);
    line(`  Mașini:       ${stoc}`);
    line(`  Presetare:    #${parc.preset}`);
    line(`  WhatsApp:     ${parc.whatsapp}   ← normalizat automat`);
    line('══════════════════════════════════════════════════');
    line();
    line('  Testează:');
    line(`    producție:  https://${parc.subdomain}.car-flip.com`);
    line(`    local:      http://localhost:4000/?__parc=${parc.subdomain}`);
    line();
    line('  Verifică și un subdomeniu inexistent → trebuie 404 stilizat:');
    line('    https://asdfgh.car-flip.com');
    line();

    await mongoose.disconnect();
    process.exit(0);
};

run().catch((err) => {
    console.error('❌ Eroare:', err.message);
    if (err.errors) {
        for (const [k, e] of Object.entries(err.errors)) {
            console.error(`   • ${k}: ${e.message}`);
        }
    }
    process.exit(1);
});
