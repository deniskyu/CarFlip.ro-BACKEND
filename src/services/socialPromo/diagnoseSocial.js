import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import sales from '../models/salesModel.js';

const line = (s = '') => console.log(s);
const ok = (s) => console.log(`  ✅ ${s}`);
const bad = (s) => console.log(`  ❌ ${s}`);
const warn = (s) => console.log(`  ⚠️  ${s}`);

const run = async () => {
    line('══════════════════════════════════════════');
    line(' DIAGNOSTIC POSTARE SOCIALĂ');
    line('══════════════════════════════════════════');
    line();

    line('1. VARIABILE DE MEDIU');
    const enabled = String(process.env.SOCIAL_PROMO_ENABLED) === 'true';
    const apiKey = process.env.ZERNIO_API_KEY;
    const fbId = process.env.ZERNIO_FB_ACCOUNT_ID;
    const ttId = process.env.ZERNIO_TT_ACCOUNT_ID;

    enabled
        ? ok('SOCIAL_PROMO_ENABLED = true')
        : bad(`SOCIAL_PROMO_ENABLED = ${process.env.SOCIAL_PROMO_ENABLED || '(lipsă)'} → NIMIC nu se postează`);
    apiKey
        ? ok(`ZERNIO_API_KEY setat (${apiKey.slice(0, 8)}...)`)
        : bad('ZERNIO_API_KEY LIPSEȘTE');
    fbId
        ? ok(`ZERNIO_FB_ACCOUNT_ID = ${fbId}`)
        : bad('ZERNIO_FB_ACCOUNT_ID LIPSEȘTE → Facebook nu se postează deloc');
    ttId
        ? ok(`ZERNIO_TT_ACCOUNT_ID = ${ttId}`)
        : bad('ZERNIO_TT_ACCOUNT_ID LIPSEȘTE → TikTok nu se postează deloc');

    line();
    line('2. CONTURI CONECTATE LA ZERNIO');
    if (!apiKey) {
        bad('Sar peste — fără API key.');
    } else {
        try {
            const res = await fetch('https://zernio.com/api/v1/accounts', {
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            const text = await res.text();
            if (!res.ok) {
                bad(`HTTP ${res.status}: ${text.slice(0, 200)}`);
            } else {
                const data = JSON.parse(text);
                const list = data?.accounts || data?.data || (Array.isArray(data) ? data : []);
                if (!list.length) {
                    bad('Zernio nu raportează NICIUN cont conectat.');
                } else {
                    for (const acc of list) {
                        const id = acc._id || acc.id || acc.accountId;
                        line(`  • ${acc.platform} | ${acc.username || acc.name || '(fără nume)'} | id: ${id}`);
                        if (acc.platform === 'facebook' && id !== fbId) {
                            warn(`ZERNIO_FB_ACCOUNT_ID din .env (${fbId}) NU se potrivește cu ${id}`);
                        }
                        if (acc.platform === 'tiktok' && id !== ttId) {
                            warn(`ZERNIO_TT_ACCOUNT_ID din .env (${ttId}) NU se potrivește cu ${id}`);
                        }
                    }
                }
            }
        } catch (err) {
            bad(`Nu am putut interoga Zernio: ${err.message}`);
        }
    }

    line();
    line('3. BAZA DE DATE — PÂLNIA DE ELIGIBILITATE');
    await mongoose.connect(process.env.DB_URL);

    const total = await sales.countDocuments({});
    const withFlag = await sales.countDocuments({ allow_social_promo: true });
    const active = await sales.countDocuments({ allow_social_promo: true, is_active: true, status: 'active' });
    const fbPending = await sales.countDocuments({
        allow_social_promo: true, is_active: true, status: 'active',
        'social_promo.facebook.status': 'pending',
    });
    const ttPending = await sales.countDocuments({
        allow_social_promo: true, is_active: true, status: 'active',
        'social_promo.tiktok.status': 'pending',
    });

    line(`  Total anunțuri:                        ${total}`);
    line(`  ...cu allow_social_promo = true:       ${withFlag}`);
    line(`  ...și active:                          ${active}`);
    line(`  ...și facebook.status = 'pending':     ${fbPending}`);
    line(`  ...și tiktok.status = 'pending':       ${ttPending}`);

    if (withFlag === 0) {
        bad('NICIUN anunț nu are bifa pornită. Postează unul nou cu checkbox-ul bifat.');
    } else if (active === 0) {
        bad('Anunțurile cu bifă nu sunt active (probabil încă în media_processing).');
    } else if (fbPending === 0 && ttPending === 0) {
        bad("Câmpul social_promo lipsește din documente — verifică schema (Mongoose strict le aruncă tăcut).");
    } else {
        ok('Există anunțuri eligibile în coadă.');
    }

    line();
    line('4. ULTIMELE 3 ANUNȚURI CU BIFA PORNITĂ');
    const recent = await sales.find({ allow_social_promo: true })
        .sort({ createdAt: -1 }).limit(3)
        .select('_id title status is_active media social_promo createdAt').lean();

    if (!recent.length) {
        bad('Niciunul.');
    } else {
        for (const s of recent) {
            const imgs = (s.media || []).filter(m => m.type === 'image').length;
            line(`  ─ ${s._id} | "${s.title}"`);
            line(`     status=${s.status} is_active=${s.is_active} imagini=${imgs}`);
            line(`     fb: ${JSON.stringify(s.social_promo?.facebook || 'LIPSĂ')}`);
            line(`     tt: ${JSON.stringify(s.social_promo?.tiktok || 'LIPSĂ')}`);
            if (imgs === 0) warn('Anunț fără imagini → va fi marcat "skipped".');
        }
    }

    line();
    line('5. POSTĂRI DEJA TRIMISE');
    const fbPosted = await sales.countDocuments({ 'social_promo.facebook.posted_at': { $ne: null } });
    const ttPosted = await sales.countDocuments({ 'social_promo.tiktok.posted_at': { $ne: null } });
    const fbFailed = await sales.countDocuments({ 'social_promo.facebook.status': 'failed' });
    const ttFailed = await sales.countDocuments({ 'social_promo.tiktok.status': 'failed' });
    line(`  Facebook: ${fbPosted} postate, ${fbFailed} eșuate definitiv`);
    line(`  TikTok:   ${ttPosted} postate, ${ttFailed} eșuate definitiv`);

    const errs = await sales.find({
        $or: [
            { 'social_promo.facebook.last_error': { $ne: null } },
            { 'social_promo.tiktok.last_error': { $ne: null } },
        ],
    }).sort({ updatedAt: -1 }).limit(5).select('_id social_promo').lean();

    if (errs.length) {
        line();
        line('  Ultimele erori înregistrate:');
        for (const e of errs) {
            const fe = e.social_promo?.facebook?.last_error;
            const te = e.social_promo?.tiktok?.last_error;
            if (fe) line(`   [fb] ${e._id}: ${fe}`);
            if (te) line(`   [tt] ${e._id}: ${te}`);
        }
    } else {
        line('  Nicio eroare înregistrată — semn că dispecerul nu a ajuns să apeleze Zernio.');
    }

    line();
    line('══════════════════════════════════════════');
    await mongoose.disconnect();
    process.exit(0);
};

run().catch(err => {
    console.error('Diagnostic eșuat:', err);
    process.exit(1);
});
