import sales from '../models/salesModel.js';
import parcuri from '../models/parcModel.js';
import { invalidateParcCache } from './parcCache.js';

// ============================================================================
//  src/services/indexableCheck.js
// ----------------------------------------------------------------------------
//  Gardul care decide dacă un site are voie să fie indexat de Google.
//
//  ── DE CE EXISTĂ ──────────────────────────────────────────────────────────
//  Google atribuie semnale de calitate la nivel de DOMENIU, nu de subdomeniu.
//  Dacă car-flip.com ajunge să găzduiască 200 de subdomenii comerciale subțiri
//  (4 mașini, fără descrieri, fără contact), penalizarea nu lovește subdomeniul
//  vinovat — poate lovi rădăcina, adică TOȚI clienții simultan, inclusiv cei
//  care plătesc și au conținut bun.
//
//  E singurul mecanism din tot proiectul care poate strica totul deodată, iar
//  costul prevenirii e fișierul ăsta. Raportul efort/risc e absurd de bun.
//
//  ── NICIODATĂ SETAT MANUAL ────────────────────────────────────────────────
//  `indexable` nu se editează din formular. Se recalculează automat: la
//  crearea parcului, la orice modificare, și (din Batch 9) la fiecare
//  schimbare de stoc. Dacă ar fi editabil, cineva l-ar pune pe true „doar
//  pentru testare" și ar rămâne așa.
// ============================================================================

export const THRESHOLDS = {
    MIN_ACTIVE_CARS: 10,
    MIN_DESCRIPTION_CHARS: 200,
    MIN_RICH_DESCRIPTION_RATIO: 0.6, // 60% din anunțuri cu descriere consistentă
};

/**
 * Citește statisticile de stoc pentru unul sau mai mulți useri, într-un
 * singur query agregat. Folosit și de lista de parcuri din panou — de aceea
 * întoarce și `last_post_at`, indicatorul care arată ce client a încetat să
 * mai posteze (semnalul cel mai timpuriu de client pierdut).
 *
 * @param {Array<ObjectId|string>} userIds
 * @returns {Promise<Map<string, {total, rich, last_post_at}>>}
 */
export const getStockStats = async (userIds) => {
    const map = new Map();
    if (!Array.isArray(userIds) || userIds.length === 0) return map;

    const rows = await sales.aggregate([
        { $match: { user_id: { $in: userIds }, is_active: true } },
        {
            $group: {
                _id: '$user_id',
                total: { $sum: 1 },
                rich: {
                    $sum: {
                        $cond: [
                            {
                                $gte: [
                                    { $strLenCP: { $ifNull: ['$description', ''] } },
                                    THRESHOLDS.MIN_DESCRIPTION_CHARS,
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
                last_post_at: { $max: '$createdAt' },
            },
        },
    ]);

    for (const r of rows) {
        map.set(String(r._id), {
            total: r.total,
            rich: r.rich,
            last_post_at: r.last_post_at,
        });
    }
    return map;
};

/**
 * Evaluează dacă un parc îndeplinește condițiile de indexare.
 *
 * Întoarce ȘI lista de motive pentru care NU e indexabil, ca panoul de admin
 * să poată afișa exact ce lipsește. Fără asta, „indexable: false" e o cutie
 * neagră și ajungi să ghicești.
 *
 * @param {object} parc  document sau obiect lean
 * @param {{total:number, rich:number}} [stats]  dacă lipsește, se interoghează
 */
export const computeIndexable = async (parc, stats) => {
    if (!parc) return { indexable: false, reasons: ['Parc inexistent.'], stats: null };

    let s = stats;
    if (!s) {
        const m = await getStockStats([parc.user_id]);
        s = m.get(String(parc.user_id)) || { total: 0, rich: 0, last_post_at: null };
    }

    const reasons = [];

    if (parc.active === false) {
        reasons.push('Site-ul este dezactivat.');
    }

    if (s.total < THRESHOLDS.MIN_ACTIVE_CARS) {
        reasons.push(`Doar ${s.total} mașini active (minim ${THRESHOLDS.MIN_ACTIVE_CARS}).`);
    }

    const ratio = s.total > 0 ? s.rich / s.total : 0;
    if (s.total > 0 && ratio < THRESHOLDS.MIN_RICH_DESCRIPTION_RATIO) {
        reasons.push(
            `Doar ${Math.round(ratio * 100)}% dintre anunțuri au descriere de peste ` +
            `${THRESHOLDS.MIN_DESCRIPTION_CHARS} de caractere (minim ` +
            `${Math.round(THRESHOLDS.MIN_RICH_DESCRIPTION_RATIO * 100)}%).`
        );
    }

    const contactMissing = [];
    if (!parc.phone) contactMissing.push('telefon');
    if (!parc.whatsapp) contactMissing.push('WhatsApp');
    if (!parc.address) contactMissing.push('adresă');
    if (typeof parc.lat !== 'number' || typeof parc.lng !== 'number') contactMissing.push('coordonate');
    if (!Array.isArray(parc.schedule) || parc.schedule.length === 0) contactMissing.push('program');
    if (contactMissing.length) reasons.push(`Contact incomplet: ${contactMissing.join(', ')}.`);

    if (!parc.logo_url || !parc.banner_url) {
        reasons.push('Lipsește logo-ul sau bannerul.');
    }

    const firmMissing = [];
    if (!parc.company_name) firmMissing.push('denumire');
    if (!parc.company_cui) firmMissing.push('CUI');
    if (!parc.company_reg) firmMissing.push('nr. Registrul Comerțului');
    if (!parc.company_address) firmMissing.push('sediu');
    if (firmMissing.length) reasons.push(`Date de firmă incomplete: ${firmMissing.join(', ')}.`);

    return {
        indexable: reasons.length === 0,
        reasons,
        stats: { ...s, rich_ratio: Math.round(ratio * 100) },
    };
};

/**
 * Recalculează și SALVEAZĂ `indexable`, invalidând cache-ul dacă s-a schimbat.
 *
 * Scrie în DB doar când valoarea chiar diferă — un `updateOne` inutil ar
 * împinge `updatedAt` și ar invalida cache-ul degeaba la fiecare recalculare.
 *
 * @returns {Promise<{ indexable, reasons, stats, changed }>}
 */
export const refreshIndexable = async (parcOrId) => {
    const parc = typeof parcOrId === 'object' && parcOrId?.subdomain
        ? parcOrId
        : await parcuri.findById(parcOrId).lean();

    if (!parc) return { indexable: false, reasons: ['Parc inexistent.'], stats: null, changed: false };

    const result = await computeIndexable(parc);
    const changed = parc.indexable !== result.indexable;

    if (changed) {
        await parcuri.updateOne({ _id: parc._id }, { $set: { indexable: result.indexable } });
        await invalidateParcCache(parc.subdomain);
        console.log(
            `🔎 [indexable] ${parc.subdomain}: ${parc.indexable} → ${result.indexable}` +
            (result.reasons.length ? ` (${result.reasons.join(' ')})` : '')
        );
    }

    return { ...result, changed };
};

export default { THRESHOLDS, getStockStats, computeIndexable, refreshIndexable };
