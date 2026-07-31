import sales from '../../models/salesModel.js';
import SocialCleanup from '../../models/socialCleanupModel.js';
import SocialPostLog from '../../models/socialPostLogModel.js';
import { buildCaptions } from './captions.js';
import {
    SOCIAL_ENABLED,
    isConfigured,
    postToFacebook,
    postToTikTok,
    unpublishPost,
} from './zernioClient.js';

export const PLATFORM_CONFIG = {
    facebook: {
        minIntervalMinutes: 75,
        dailyCap: 19,
        maxImages: 8,
        canUnpublish: true,
    },
    tiktok: {
        minIntervalMinutes: 120,
        dailyCap: 12,
        maxImages: 8,
        canUnpublish: false,
    },
};

// Erori PERMANENTE (conținut respins, cerere invalidă): puține șanse.
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MINUTES = [15, 60, 240];

// Erori TEMPORARE (429, 5xx, rețea): multe șanse, backoff lung.
// Nu consumă din MAX_ATTEMPTS — o pană la Zernio nu trebuie să omoare anunțul.
const MAX_TEMP_FAILURES = 20;
const TEMP_BACKOFF_MINUTES = [5, 15, 30, 60, 120, 240];

// Învierea anunțurilor moarte: după 24h, de maximum 2 ori.
const REVIVE_AFTER_HOURS = 24;
const MAX_REVIVALS = 2;

const STUCK_CLAIM_MINUTES = 15;
const CLEANUP_BATCH = 10;
const CLEANUP_MAX_ATTEMPTS = 6;

const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000);
const minutesFromNow = (m) => new Date(Date.now() + m * 60 * 1000);
const hoursFromNow = (h) => new Date(Date.now() + h * 3600 * 1000);

const pickImages = (sale, maxImages) => {
    if (!Array.isArray(sale.media)) return [];
    return sale.media
        .filter(m => m && m.type === 'image' && typeof m.url === 'string' && m.url.startsWith('https://'))
        .slice(0, maxImages)
        .map(m => m.url);
};

const recordPostLog = async (platform, saleId, zernioPostId) => {
    try {
        await SocialPostLog.create({
            platform,
            posted_at: new Date(),
            sale_id: saleId || null,
            zernio_post_id: zernioPostId || null,
        });
    } catch (err) {
        console.error(`🚨 [social:${platform}] CRITIC: jurnalul de rate limiting nu s-a putut scrie (${err.message}). Contorul zilnic poate rămâne în urmă.`);
    }
};

const releaseStuckClaims = async (platform) => {
    const field = `social_promo.${platform}`;
    try {
        const res = await sales.updateMany(
            {
                [`${field}.status`]: 'posting',
                [`${field}.claimed_at`]: { $lt: minutesAgo(STUCK_CLAIM_MINUTES) },
            },
            {
                $set: {
                    [`${field}.status`]: 'pending',
                    [`${field}.retry_after`]: minutesFromNow(5),
                },
            }
        );
        if (res.modifiedCount > 0) {
            console.log(`♻️ [social:${platform}] ${res.modifiedCount} revendicări blocate eliberate.`);
        }
    } catch (err) {
        console.error(`❌ [social:${platform}] Eroare la eliberarea revendicărilor blocate:`, err.message);
    }
};

// Anunțurile marcate 'failed' primesc o a doua șansă după 24h.
// $not:{$gte} în loc de $lt — prinde și documentele care nu au încă acest câmp.
const reviveFailed = async (platform) => {
    const field = `social_promo.${platform}`;
    const now = new Date();
    try {
        const res = await sales.updateMany(
            {
                allow_social_promo: true,
                is_active: true,
                status: 'active',
                [`${field}.status`]: 'failed',
                [`${field}.retry_after`]: { $not: { $gt: now } },
                [`${field}.revivals`]: { $not: { $gte: MAX_REVIVALS } },
            },
            {
                $set: {
                    [`${field}.status`]: 'pending',
                    [`${field}.attempts`]: 0,
                    [`${field}.temp_failures`]: 0,
                    [`${field}.retry_after`]: null,
                },
                $inc: { [`${field}.revivals`]: 1 },
            }
        );
        if (res.modifiedCount > 0) {
            console.log(`🔁 [social:${platform}] ${res.modifiedCount} anunțuri eșuate au primit o nouă șansă.`);
        }
    } catch (err) {
        console.error(`❌ [social:${platform}] Eroare la învierea anunțurilor eșuate:`, err.message);
    }
};

const isRateWindowOpen = async (platform) => {
    const cfg = PLATFORM_CONFIG[platform];

    const lastPost = await SocialPostLog
        .findOne({ platform })
        .sort({ posted_at: -1 })
        .select('posted_at')
        .lean();

    if (lastPost && lastPost.posted_at && lastPost.posted_at > minutesAgo(cfg.minIntervalMinutes)) {
        return false;
    }

    const postedLast24h = await SocialPostLog.countDocuments({
        platform,
        posted_at: { $gte: minutesAgo(24 * 60) },
    });

    if (postedLast24h >= cfg.dailyCap) {
        console.log(`⏸️ [social:${platform}] Plafon zilnic atins (${postedLast24h}/${cfg.dailyCap}).`);
        return false;
    }

    return true;
};

const claimNextSale = async (platform) => {
    const field = `social_promo.${platform}`;
    const now = new Date();

    return sales.findOneAndUpdate(
        {
            allow_social_promo: true,
            is_active: true,
            status: 'active',
            [`${field}.status`]: 'pending',
            [`${field}.retry_after`]: { $not: { $gt: now } },
        },
        {
            $set: {
                [`${field}.status`]: 'posting',
                [`${field}.claimed_at`]: now,
            },
        },
        { sort: { createdAt: 1 }, new: true }
    );
};

const markResult = async (saleId, platform, patch) => {
    const field = `social_promo.${platform}`;
    const $set = {};
    for (const [k, v] of Object.entries(patch)) $set[`${field}.${k}`] = v;
    return sales.findOneAndUpdate({ _id: saleId }, { $set }, { new: true });
};

const handleFailure = async (sale, platform, err) => {
    const st = (sale.social_promo && sale.social_promo[platform]) || {};
    const message = String(err?.message || err).slice(0, 400);

    // TIMEOUT — nu știm dacă postarea a ajuns pe platformă sau nu.
    // Nu reluăm: un duplicat pe TikTok nu se poate șterge niciodată.
    if (err && err.timeout) {
        await markResult(sale._id, platform, {
            status: 'unknown',
            last_error: `TIMEOUT — verifică manual dacă postarea există pe pagină. ${message}`,
        });
        console.error(`❓ [social:${platform}] ${sale._id} TIMEOUT. Marcat 'unknown', NU se reia automat (risc de duplicat).`);
        return;
    }

    // EROARE TEMPORARĂ — Zernio/platforma indisponibile. Nu consumă din attempts.
    if (err && err.retryable) {
        const temp = (st.temp_failures || 0) + 1;

        if (temp >= MAX_TEMP_FAILURES) {
            await markResult(sale._id, platform, {
                status: 'failed',
                temp_failures: temp,
                last_error: message,
                retry_after: hoursFromNow(REVIVE_AFTER_HOURS),
            });
            console.error(`🚫 [social:${platform}] ${sale._id}: ${temp} eșecuri temporare consecutive. Marcat failed.`);
            return;
        }

        const backoff = TEMP_BACKOFF_MINUTES[Math.min(temp - 1, TEMP_BACKOFF_MINUTES.length - 1)];
        await markResult(sale._id, platform, {
            status: 'pending',
            temp_failures: temp,
            last_error: message,
            retry_after: minutesFromNow(backoff),
        });
        console.warn(`⏳ [social:${platform}] Eroare temporară ${temp}/${MAX_TEMP_FAILURES} pentru ${sale._id}, reia peste ${backoff} min: ${message}`);
        return;
    }

    // EROARE PERMANENTĂ — conținut respins, cerere invalidă.
    const attempts = (st.attempts || 0) + 1;

    if (attempts >= MAX_ATTEMPTS) {
        await markResult(sale._id, platform, {
            status: 'failed',
            attempts,
            last_error: message,
            retry_after: hoursFromNow(REVIVE_AFTER_HOURS),
        });
        console.error(`🚫 [social:${platform}] Eșec definitiv pentru ${sale._id} (${attempts} încercări): ${message}`);
        return;
    }

    const backoff = RETRY_BACKOFF_MINUTES[attempts - 1] || 240;
    await markResult(sale._id, platform, {
        status: 'pending',
        attempts,
        last_error: message,
        retry_after: minutesFromNow(backoff),
    });
    console.warn(`⚠️ [social:${platform}] Încercarea ${attempts} a eșuat pentru ${sale._id}, reia peste ${backoff} min: ${message}`);
};

const enqueueCleanupRecord = async (zernioPostId, saleId) => {
    if (!zernioPostId) return;
    try {
        await SocialCleanup.updateOne(
            { zernio_post_id: zernioPostId },
            {
                $setOnInsert: {
                    zernio_post_id: zernioPostId,
                    platform: 'facebook',
                    sale_id: saleId || null,
                    next_attempt_at: new Date(),
                },
            },
            { upsert: true }
        );
    } catch (err) {
        console.error('❌ [social] Nu am putut înregistra ștergerea socială:', err.message);
    }
};

const dispatchPlatform = async (platform) => {
    if (!isConfigured(platform)) return;

    await releaseStuckClaims(platform);
    await reviveFailed(platform);

    const open = await isRateWindowOpen(platform);
    if (!open) return;

    const sale = await claimNextSale(platform);
    if (!sale) return;

    const cfg = PLATFORM_CONFIG[platform];
    const imageUrls = pickImages(sale, cfg.maxImages);

    if (imageUrls.length === 0) {
        await markResult(sale._id, platform, {
            status: 'skipped',
            last_error: 'Anunțul nu are nicio imagine HTTPS utilizabilă.',
        });
        console.log(`⏭️ [social:${platform}] ${sale._id} sărit (fără imagini).`);
        return;
    }

    let zernioPostId = null;

    try {
        const captions = buildCaptions(sale);

        if (platform === 'facebook') {
            zernioPostId = await postToFacebook({
                imageUrls,
                caption: captions.facebookCaption,
                firstComment: captions.facebookFirstComment,
            });
        } else {
            zernioPostId = await postToTikTok({
                imageUrls,
                title: captions.tiktokTitle,
                description: captions.tiktokDescription,
            });
        }
    } catch (err) {
        await handleFailure(sale, platform, err);
        return;
    }

    await recordPostLog(platform, sale._id, zernioPostId);

    const updated = await markResult(sale._id, platform, {
        status: 'posted',
        zernio_post_id: zernioPostId,
        posted_at: new Date(),
        last_error: null,
    });

    if (!updated) {
        console.warn(`🧹 [social:${platform}] Anunțul ${sale._id} a dispărut în timpul postării. Curăț imediat.`);
        if (cfg.canUnpublish) {
            await enqueueCleanupRecord(zernioPostId, sale._id);
        }
        return;
    }

    console.log(`✅ [social:${platform}] Postat ${sale._id} (${imageUrls.length} imagini) → ${zernioPostId}`);
};

export const dispatchSocialQueue = async () => {
    if (!SOCIAL_ENABLED) return;
    try {
        await dispatchPlatform('facebook');
    } catch (err) {
        console.error('❌ [social:facebook] Eroare neprevăzută în dispecer:', err.message);
    }
    try {
        await dispatchPlatform('tiktok');
    } catch (err) {
        console.error('❌ [social:tiktok] Eroare neprevăzută în dispecer:', err.message);
    }
};

// Acceptă atât documente complete, cât și documente parțiale venite din
// .select()/.lean(). Dacă lipsește social_promo dintr-o proiecție, recitim
// exact câmpul necesar în loc să eșuăm tăcut.
export const enqueueSocialCleanup = async (sale) => {
    if (!sale || !sale._id) return;

    let fbId = sale.social_promo?.facebook?.zernio_post_id;

    if (!fbId && sale.social_promo === undefined && sale.status === undefined) {
        try {
            const fresh = await sales
                .findById(sale._id)
                .select('social_promo.facebook.zernio_post_id')
                .lean();
            fbId = fresh?.social_promo?.facebook?.zernio_post_id;
        } catch (err) {
            console.error(`❌ [social] Nu am putut reciti social_promo pentru ${sale._id}:`, err.message);
        }
    }

    if (fbId) await enqueueCleanupRecord(fbId, sale._id);
};

export const enqueueSocialCleanupMany = async (salesArray) => {
    if (!Array.isArray(salesArray) || salesArray.length === 0) return;
    for (const sale of salesArray) {
        await enqueueSocialCleanup(sale);
    }
};

export const drainSocialCleanup = async () => {
    if (!SOCIAL_ENABLED || !isConfigured('facebook')) return;

    let pending;
    try {
        pending = await SocialCleanup.find({ next_attempt_at: { $lte: new Date() } })
            .sort({ next_attempt_at: 1 })
            .limit(CLEANUP_BATCH)
            .lean();
    } catch (err) {
        console.error('❌ [social:cleanup] Nu am putut citi coada de ștergeri:', err.message);
        return;
    }

    if (!pending || pending.length === 0) return;

    for (const item of pending) {
        try {
            await unpublishPost(item.zernio_post_id, item.platform);
            await SocialCleanup.deleteOne({ _id: item._id });
            console.log(`🗑️ [social:cleanup] Postare eliminată de pe ${item.platform}: ${item.zernio_post_id}`);
        } catch (err) {
            const status = err?.status;
            const attempts = (item.attempts || 0) + 1;

            if (status === 404) {
                await SocialCleanup.deleteOne({ _id: item._id });
                console.log(`🗑️ [social:cleanup] ${item.zernio_post_id} nu mai există la Zernio, scot din coadă.`);
                continue;
            }

            if (attempts >= CLEANUP_MAX_ATTEMPTS) {
                await SocialCleanup.deleteOne({ _id: item._id });
                console.error(`🚨 [social:cleanup] ABANDONAT după ${attempts} încercări: ${item.zernio_post_id} — ȘTERGE MANUAL de pe pagină. Ultima eroare: ${err.message}`);
                continue;
            }

            await SocialCleanup.updateOne(
                { _id: item._id },
                {
                    $set: {
                        attempts,
                        last_error: String(err.message).slice(0, 400),
                        next_attempt_at: minutesFromNow(30 * attempts),
                    },
                }
            );
            console.warn(`⚠️ [social:cleanup] Încercarea ${attempts} a eșuat pentru ${item.zernio_post_id}: ${err.message}`);
        }
    }
};

// Raport de sănătate — apelat de cron-ul zilnic. Scopul e să NU rămână
// anunțuri moarte sau incerte fără ca cineva să afle.
export const reportSocialHealth = async () => {
    if (!SOCIAL_ENABLED) return;
    try {
        const [fbFailed, ttFailed, fbUnknown, ttUnknown, fbSkipped, ttSkipped, cleanupBacklog] = await Promise.all([
            sales.countDocuments({ 'social_promo.facebook.status': 'failed' }),
            sales.countDocuments({ 'social_promo.tiktok.status': 'failed' }),
            sales.countDocuments({ 'social_promo.facebook.status': 'unknown' }),
            sales.countDocuments({ 'social_promo.tiktok.status': 'unknown' }),
            sales.countDocuments({ 'social_promo.facebook.status': 'skipped' }),
            sales.countDocuments({ 'social_promo.tiktok.status': 'skipped' }),
            SocialCleanup.countDocuments({}),
        ]);

        const problems = fbFailed + ttFailed + fbUnknown + ttUnknown;

        if (problems === 0 && cleanupBacklog === 0) {
            console.log('💚 [social:health] Totul curat.');
            return;
        }

        console.warn(
            `🩺 [social:health] failed fb=${fbFailed} tt=${ttFailed} | ` +
            `unknown fb=${fbUnknown} tt=${ttUnknown} | ` +
            `skipped fb=${fbSkipped} tt=${ttSkipped} | ` +
            `ștergeri restante=${cleanupBacklog}`
        );

        if (fbUnknown + ttUnknown > 0) {
            console.error(`❗ [social:health] ${fbUnknown + ttUnknown} anunțuri în stare 'unknown' — verifică manual paginile, pot fi postări duplicate sau lipsă.`);
        }
    } catch (err) {
        console.error('❌ [social:health] Raportul a eșuat:', err.message);
    }
};
