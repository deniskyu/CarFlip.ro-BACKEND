import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sales from '../models/salesModel.js';
import Comments from '../models/commentModel.js';
import SeenPost from '../models/seenPostsModel.js';
import { enqueueSocialCleanup } from './socialPromo/socialPromoService.js';

// ============================================================================
//  src/services/saleDeletion.js
// ----------------------------------------------------------------------------
//  Ștergerea completă a unui anunț, într-un singur loc.
//
//  ── DE CE UN SERVICIU ȘI NU COD COPIAT ────────────────────────────────────
//  Ștergerea are cinci pași care trebuie făcuți în ordinea corectă. Se apelează
//  din trei locuri: aplicația mobilă, panoul dealerului și panoul tău de admin.
//  Copiat în trei locuri, unul ar uita cleanup-ul social și postările ar rămâne
//  publicate pe Facebook pe veci.
//
//  ── ORDINEA CONTEAZĂ ──────────────────────────────────────────────────────
//  Cleanup-ul social se face PRIMUL, cât timp documentul mai există: acolo stă
//  `zernio_post_id`. Șters documentul întâi, identificatorul se pierde și
//  postarea nu mai poate fi retrasă niciodată.
//
//  ── BEST-EFFORT PE CURĂȚENII ──────────────────────────────────────────────
//  Eșecul ștergerii unei poze din R2 nu blochează ștergerea anunțului. Un
//  fișier orfan costă câțiva kilobytes; un document care refuză să dispară e o
//  problemă reală pentru dealer.
// ============================================================================

const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

/**
 * Șterge definitiv un anunț și tot ce ține de el.
 *
 * @param {string} saleId
 * @param {string} [ownerId]  dacă e dat, intră în FILTRU — un anunț al altui
 *                            utilizator pur și simplu nu se găsește
 * @returns {Promise<{ deleted: boolean, media: number }>}
 */
export const deleteSaleCompletely = async (saleId, ownerId = null) => {
    const filter = { _id: saleId };
    if (ownerId) filter.user_id = ownerId;

    const sale = await sales.findOne(filter).lean();
    if (!sale) return { deleted: false, media: 0 };

    // 1. Postările sociale — ÎNAINTE de ștergere, cât timp mai avem id-urile.
    try {
        await enqueueSocialCleanup(sale);
    } catch (err) {
        console.warn(`⚠️ [saleDeletion] cleanup social eșuat pentru ${saleId}:`, err.message);
    }

    // 2. Fișierele din R2, în paralel, best-effort.
    let mediaDeleted = 0;
    const keys = (sale.media || []).map((m) => m.public_id).filter(Boolean);
    await Promise.all(keys.map((Key) =>
        r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key }))
            .then(() => { mediaDeleted++; })
            .catch((err) => console.warn(`⚠️ [saleDeletion] R2 ${Key}:`, err.message))
    ));

    // 3. Date orfane.
    await Promise.all([
        Comments.deleteMany({ sale_id: sale._id }).catch(() => {}),
        SeenPost.deleteMany({ sale_id: sale._id }).catch(() => {}),
    ]);

    // 4. Documentul. Filtrul include din nou `user_id` — dacă între timp
    //    anunțul a fost mutat sau șters, nu atingem nimic al altcuiva.
    const r = await sales.deleteOne(filter);

    console.log(`🗑️ [saleDeletion] ${saleId} șters · ${mediaDeleted}/${keys.length} fișiere R2`);
    return { deleted: (r.deletedCount || 0) > 0, media: mediaDeleted };
};

export default { deleteSaleCompletely };
