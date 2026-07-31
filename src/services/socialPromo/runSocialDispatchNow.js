import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import sales from '../../models/salesModel.js';
import { dispatchSocialQueue } from './socialPromoService.js';
import { SOCIAL_ENABLED, isConfigured } from './zernioClient.js';

const line = (s = '') => console.log(s);

const showState = async (label) => {
    const docs = await sales.find({ allow_social_promo: true })
        .sort({ createdAt: -1 }).limit(3)
        .select('_id title social_promo').lean();

    line();
    line(`── ${label} ──`);
    if (!docs.length) {
        line('  (niciun anunț cu bifa pornită)');
        return;
    }
    for (const d of docs) {
        const fb = d.social_promo?.facebook || {};
        const tt = d.social_promo?.tiktok || {};
        line(`  ${d._id} "${d.title}"`);
        line(`    fb: status=${fb.status} id=${fb.zernio_post_id} attempts=${fb.attempts}`);
        if (fb.last_error) line(`        ERROR: ${fb.last_error}`);
        line(`    tt: status=${tt.status} id=${tt.zernio_post_id} attempts=${tt.attempts}`);
        if (tt.last_error) line(`        ERROR: ${tt.last_error}`);
    }
};

const run = async () => {
    line('══════════════════════════════════════════');
    line(' RULARE MANUALĂ A DISPECERULUI');
    line('══════════════════════════════════════════');
    line(`  SOCIAL_ENABLED        = ${SOCIAL_ENABLED}`);
    line(`  isConfigured(facebook)= ${isConfigured('facebook')}`);
    line(`  isConfigured(tiktok)  = ${isConfigured('tiktok')}`);

    if (!SOCIAL_ENABLED) {
        line();
        line('  ❌ SOCIAL_ENABLED e false în ACEST proces. Verifică .env.');
        process.exit(1);
    }

    await mongoose.connect(process.env.DB_URL);
    line('  ✅ Conectat la MongoDB');

    await showState('ÎNAINTE');

    line();
    line('── APELEZ dispatchSocialQueue() ──');
    line('   (o singură postare per platformă, ca la un tick de cron)');
    line();

    await dispatchSocialQueue();

    await new Promise(r => setTimeout(r, 1500));
    await showState('DUPĂ');

    line();
    line('══════════════════════════════════════════');
    line(' Dacă statusul e tot "pending" și nu apare nicio eroare,');
    line(' fereastra de rate limiting e închisă (ai postat recent).');
    line('══════════════════════════════════════════');

    await mongoose.disconnect();
    process.exit(0);
};

run().catch(err => {
    console.error('EȘEC:', err);
    process.exit(1);
});