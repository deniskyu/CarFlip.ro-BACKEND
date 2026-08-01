import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import sales from '../../models/salesModel.js';
import SocialPostLog from '../../models/socialPostLogModel.js';
import SocialCleanup from '../../models/socialCleanupModel.js';
import { PLATFORM_CONFIG } from './socialPromoService.js';

const line = (s = '') => console.log(s);
const ok = (s) => console.log(`  ✅ ${s}`);
const bad = (s) => console.log(`  ❌ ${s}`);
const warn = (s) => console.log(`  ⚠️  ${s}`);
const alert = (s) => console.log(`  ❗ ${s}`);

const PLATFORMS = ['facebook', 'tiktok'];
const STATUSES = ['pending', 'posting', 'posted', 'failed', 'skipped', 'unknown'];

const ago = (date) => {
    if (!date) return 'niciodată';
    const diff = Math.round((Date.now() - new Date(date).getTime()) / 60000);
    const future = diff < 0;
    const mins = Math.abs(diff);
    const pre = future ? 'peste' : 'acum';
    if (mins < 1) return future ? 'imediat' : 'chiar acum';
    if (mins < 60) return `${pre} ${mins} min`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${pre} ${h}h ${mins % 60}min`;
    return `${pre} ${Math.floor(h / 24)}z ${h % 24}h`;
};

const run = async () => {
    line('══════════════════════════════════════════════════');
    line(' DIAGNOSTIC PROMOVARE SOCIALĂ');
    line('══════════════════════════════════════════════════');
    line();

    // ─── 1. CONFIGURARE ──────────────────────────────────────────────
    line('1. VARIABILE DE MEDIU');
    const enabled = String(process.env.SOCIAL_PROMO_ENABLED) === 'true';
    const apiKey = process.env.ZERNIO_API_KEY;
    const fbId = process.env.ZERNIO_FB_ACCOUNT_ID;
    const ttId = process.env.ZERNIO_TT_ACCOUNT_ID;

    enabled
        ? ok('SOCIAL_PROMO_ENABLED = true')
        : bad(`SOCIAL_PROMO_ENABLED = ${process.env.SOCIAL_PROMO_ENABLED || '(lipsă)'} → NIMIC nu se postează`);
    apiKey ? ok(`ZERNIO_API_KEY setat (${apiKey.slice(0, 8)}...)`) : bad('ZERNIO_API_KEY LIPSEȘTE');
    fbId ? ok(`ZERNIO_FB_ACCOUNT_ID = ${fbId}`) : bad('ZERNIO_FB_ACCOUNT_ID LIPSEȘTE → Facebook oprit');
    ttId ? ok(`ZERNIO_TT_ACCOUNT_ID = ${ttId}`) : bad('ZERNIO_TT_ACCOUNT_ID LIPSEȘTE → TikTok oprit');

    // ─── 2. CONTURI ZERNIO ───────────────────────────────────────────
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
                        line(`  • ${acc.platform} | ${acc.username || acc.name || '(fără nume)'} | ${id}`);
                        if (acc.platform === 'facebook' && id !== fbId) warn(`NEPOTRIVIRE: .env are ${fbId}`);
                        if (acc.platform === 'tiktok' && id !== ttId) warn(`NEPOTRIVIRE: .env are ${ttId}`);
                    }
                }
            }
        } catch (err) {
            bad(`Nu am putut interoga Zernio: ${err.message}`);
        }
    }

    await mongoose.connect(process.env.DB_URL);

    // ─── 3. PÂLNIA DE ELIGIBILITATE ──────────────────────────────────
    line();
    line('3. PÂLNIA DE ELIGIBILITATE');
    const total = await sales.countDocuments({});
    const withFlag = await sales.countDocuments({ allow_social_promo: true });
    const active = await sales.countDocuments({ allow_social_promo: true, is_active: true, status: 'active' });
    line(`  Total anunțuri:                  ${total}`);
    line(`  ...cu promovare activată:        ${withFlag}`);
    line(`  ...și active:                    ${active}`);

    if (withFlag === 0) {
        bad('Niciun anunț cu bifa pornită. Verifică allow_social_promo în schemă și în ruta /post/free.');
    }

    // ─── 4. STĂRI PE PLATFORMĂ ───────────────────────────────────────
    line();
    line('4. STĂRI PE PLATFORMĂ');
    const problems = { unknown: 0, failed: 0 };

    for (const p of PLATFORMS) {
        const counts = {};
        for (const st of STATUSES) {
            counts[st] = await sales.countDocuments({ [`social_promo.${p}.status`]: st });
        }
        const eligible = await sales.countDocuments({
            allow_social_promo: true, is_active: true, status: 'active',
            [`social_promo.${p}.status`]: 'pending',
        });

        line(`  ── ${p.toUpperCase()} ──`);
        line(`     în coadă (eligibile acum): ${eligible}`);
        line(`     pending=${counts.pending}  posting=${counts.posting}  posted=${counts.posted}`);
        line(`     failed=${counts.failed}  skipped=${counts.skipped}  unknown=${counts.unknown}`);

        problems.unknown += counts.unknown;
        problems.failed += counts.failed;

        if (counts.posting > 0) {
            const stuck = await sales.countDocuments({
                [`social_promo.${p}.status`]: 'posting',
                [`social_promo.${p}.claimed_at`]: { $lt: new Date(Date.now() - 15 * 60000) },
            });
            if (stuck > 0) warn(`${stuck} revendicări blocate >15min (se eliberează singure la următorul tick)`);
        }
    }

    // ─── 5. FEREASTRA DE RATE LIMITING ───────────────────────────────
    line();
    line('5. FEREASTRA DE POSTARE (din jurnal)');
    for (const p of PLATFORMS) {
        const cfg = PLATFORM_CONFIG[p];
        const last = await SocialPostLog.findOne({ platform: p }).sort({ posted_at: -1 }).lean();
        const last24 = await SocialPostLog.countDocuments({
            platform: p,
            posted_at: { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
        });

        const minsSince = last ? Math.round((Date.now() - new Date(last.posted_at).getTime()) / 60000) : null;
        const intervalOk = minsSince === null || minsSince >= cfg.minIntervalMinutes;
        const capOk = last24 < cfg.dailyCap;

        line(`  ── ${p.toUpperCase()} ──`);
        line(`     ultima postare: ${ago(last?.posted_at)}`);
        line(`     în ultimele 24h: ${last24}/${cfg.dailyCap}`);
        if (!intervalOk) {
            line(`     ⏸️  interval: mai sunt ${cfg.minIntervalMinutes - minsSince} min până la următoarea`);
        } else if (!capOk) {
            line(`     ⏸️  plafon zilnic atins`);
        } else {
            line(`     ▶️  fereastră DESCHISĂ`);
        }
    }

    const logTotal = await SocialPostLog.countDocuments({});
    line();
    line(`  Jurnal total (TTL 7 zile): ${logTotal} intrări`);

    // ─── 6. COADA DE ȘTERGERI ────────────────────────────────────────
    line();
    line('6. ȘTERGERI RESTANTE (Facebook)');
    const cleanupTotal = await SocialCleanup.countDocuments({});
    if (cleanupTotal === 0) {
        ok('Coada e goală.');
    } else {
        const items = await SocialCleanup.find({}).sort({ next_attempt_at: 1 }).limit(10).lean();
        line(`  ${cleanupTotal} în coadă:`);
        for (const it of items) {
            line(`   • ${it.zernio_post_id} | încercări=${it.attempts || 0} | următoarea ${ago(it.next_attempt_at)}`);
            if (it.last_error) line(`     eroare: ${String(it.last_error).slice(0, 120)}`);
        }
    }

    // ─── 7. ULTIMELE ERORI ───────────────────────────────────────────
    line();
    line('7. ULTIMELE ERORI ÎNREGISTRATE');
    const errs = await sales.find({
        $or: [
            { 'social_promo.facebook.last_error': { $ne: null } },
            { 'social_promo.tiktok.last_error': { $ne: null } },
        ],
    }).sort({ updatedAt: -1 }).limit(8).select('_id title social_promo').lean();

    if (!errs.length) {
        ok('Nicio eroare înregistrată.');
    } else {
        for (const e of errs) {
            for (const p of PLATFORMS) {
                const st = e.social_promo?.[p];
                if (st?.last_error) {
                    line(`  [${p}] ${e._id} "${e.title}" → ${st.status} (a=${st.attempts || 0} t=${st.temp_failures || 0} r=${st.revivals || 0})`);
                    line(`        ${String(st.last_error).slice(0, 160)}`);
                }
            }
        }
    }

    // ─── 8. CE CERE ATENȚIE UMANĂ ────────────────────────────────────
    line();
    line('8. CE CERE ATENȚIE');
    if (problems.unknown > 0) {
        alert(`${problems.unknown} anunțuri în stare 'unknown' — postarea a dat timeout.`);
        alert(`   Verifică MANUAL pe pagini dacă există sau nu, apoi pune statusul pe 'posted' sau 'pending'.`);
        const list = await sales.find({
            $or: [
                { 'social_promo.facebook.status': 'unknown' },
                { 'social_promo.tiktok.status': 'unknown' },
            ],
        }).limit(10).select('_id title social_promo').lean();
        for (const s of list) {
            const which = PLATFORMS.filter(p => s.social_promo?.[p]?.status === 'unknown').join(', ');
            line(`   • ${s._id} "${s.title}" → ${which}`);
        }
    }

    const exhausted = await sales.countDocuments({
        $or: [
            { 'social_promo.facebook.status': 'failed', 'social_promo.facebook.revivals': { $gte: 2 } },
            { 'social_promo.tiktok.status': 'failed', 'social_promo.tiktok.revivals': { $gte: 2 } },
        ],
    });
    if (exhausted > 0) {
        alert(`${exhausted} anunțuri eșuate DEFINITIV (au epuizat cele 2 învieri).`);
    }

    if (problems.unknown === 0 && exhausted === 0 && cleanupTotal === 0) {
        ok('Nimic. Totul e curat.');
    }

    line();
    line('══════════════════════════════════════════════════');
    await mongoose.disconnect();
    process.exit(0);
};

run().catch(err => {
    console.error('Diagnostic eșuat:', err);
    process.exit(1);
});
