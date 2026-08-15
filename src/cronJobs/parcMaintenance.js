import { addMonths, addDays, subDays } from 'date-fns';
import sales from '../models/salesModel.js';
import parcuri from '../models/parcModel.js';
import { invalidateStockFilters } from '../services/stockFilters.js';

// ============================================================================
//  src/cronJobs/parcMaintenance.js
// ----------------------------------------------------------------------------
//  Împiedică site-urile dealerilor să se golească singure.
//
//  ── PROBLEMA ──────────────────────────────────────────────────────────────
//  Un anunț primește `paid_until = acum + 6 luni`. La expirare, cronul de la 3
//  dimineața îl trece în `grace_period` cu `is_active: false`, iar după încă 10
//  zile îl șterge definitiv, cu tot cu fotografii.
//
//  Site-ul unui dealer afișează `{ user_id, is_active: true }`. Deci la șase
//  luni după livrare, site-ul pentru care a plătit s-ar goli singur, mașină cu
//  mașină. E cel mai sigur mod de a pierde un client.
//
//  ── SOLUȚIA, ȘI DE CE E LA ÎNCEPUTUL CRONULUI ─────────────────────────────
//  `protectDealerSales()` rulează ÎNAINTEA logicii de expirare și prelungește
//  `paid_until` pentru anunțurile parcurilor cu site activ. Restul cronului nu
//  le mai vede niciodată — nu intră în grace period, deci nu dispar de pe site
//  nicio zi.
//
//  Alternativa (reactivare DUPĂ ce au intrat în grace period) ar fi însemnat
//  că mașinile dispar de pe site pentru cele 10 zile de grație. Aceeași idee,
//  aplicată cu o zi mai devreme, elimină complet fereastra.
//
//  `reviveDealerSales()` rămâne ca plasă de siguranță pentru cazurile în care
//  ceva tot ajunge în grace period — de exemplu un parc creat pentru un cont
//  ale cărui anunțuri expiraseră deja.
//
//  ── COST ──────────────────────────────────────────────────────────────────
//  Două `updateMany`, o dată pe zi. Filtrele sunt acoperite de indecșii
//  existenți. Pentru un backend cu zeci de mii de anunțuri, e neglijabil.
// ============================================================================

const RENEW_MONTHS = 6;
const GRACE_DAYS = 10;
// Prelungim anunțurile care expiră în următoarele 3 zile, nu doar pe cele
// expirate azi. Dacă cronul nu rulează o noapte (repornire, pană), nimic nu
// cade prin fisură.
const HORIZON_DAYS = 3;

/** ID-urile utilizatorilor care au un site ACTIV. Un singur query. */
const activeParcUserIds = async () => {
    try {
        return await parcuri.distinct('user_id', { active: true });
    } catch (err) {
        console.error('❌ [parcMaintenance] Nu am putut citi parcurile active:', err.message);
        return null;   // null ≠ [] — vezi comentariul din protectDealerSales
    }
};

/**
 * Prelungește anunțurile parcurilor active înainte să expire.
 * Se apelează PRIMA în cronul de la 3 dimineața.
 */
export const protectDealerSales = async () => {
    const userIds = await activeParcUserIds();

    // Diferența dintre null și [] contează: `null` înseamnă că interogarea a
    // eșuat, iar în cazul ăsta preferăm să nu facem nimic decât să presupunem
    // că nu există parcuri și să lăsăm site-urile să se golească.
    if (userIds === null) {
        console.warn('⚠️ [parcMaintenance] Sar peste protecție — nu știu care parcuri sunt active.');
        return { protected: 0, skipped: true };
    }
    if (userIds.length === 0) return { protected: 0 };

    const now = new Date();
    const horizon = addDays(now, HORIZON_DAYS);
    const paidUntil = addMonths(now, RENEW_MONTHS);
    const expiresAt = addDays(paidUntil, GRACE_DAYS);

    try {
        const r = await sales.updateMany(
            {
                user_id: { $in: userIds },
                is_active: true,
                paid_until: { $lte: horizon },
            },
            { $set: { paid_until: paidUntil, expires_at: expiresAt } },
            { timestamps: false }   // nu împingem `updatedAt`: ar strica sitemap-ul
        );

        if (r.modifiedCount > 0) {
            console.log(`🛡️  [parcMaintenance] ${r.modifiedCount} anunțuri prelungite pentru parcuri cu site activ.`);
        }
        return { protected: r.modifiedCount || 0 };
    } catch (err) {
        console.error('❌ [parcMaintenance] protectDealerSales:', err.message);
        return { protected: 0, error: true };
    }
};

/**
 * Plasă de siguranță: readuce în activ anunțurile parcurilor active care au
 * ajuns totuși în grace period.
 *
 * Caz real: creezi un site pentru un dealer care avea deja anunțuri expirate.
 * Fără asta, ele s-ar șterge în 10 zile, deși site-ul e activ.
 */
export const reviveDealerSales = async () => {
    const userIds = await activeParcUserIds();
    if (!userIds || userIds.length === 0) return { revived: 0 };

    const now = new Date();
    const paidUntil = addMonths(now, RENEW_MONTHS);

    try {
        const r = await sales.updateMany(
            { user_id: { $in: userIds }, status: 'grace_period' },
            {
                $set: {
                    is_active: true,
                    status: 'active',
                    paid_until: paidUntil,
                    expires_at: addDays(paidUntil, GRACE_DAYS),
                },
            },
            { timestamps: false }
        );

        if (r.modifiedCount > 0) {
            console.log(`♻️  [parcMaintenance] ${r.modifiedCount} anunțuri readuse din grace period.`);
            // Stocul s-a schimbat pentru dealerii afectați → filtrele din cache
            // ar arăta cifre vechi.
            for (const uid of userIds) await invalidateStockFilters(uid);
        }
        return { revived: r.modifiedCount || 0 };
    } catch (err) {
        console.error('❌ [parcMaintenance] reviveDealerSales:', err.message);
        return { revived: 0, error: true };
    }
};

// ════════════════════════════════════════════════════════════════════════════
//  RAPORT LUNAR DE ANUNȚURI ÎNVECHITE
// ════════════════════════════════════════════════════════════════════════════

const STALE_DAYS = Number(process.env.PARC_STALE_DAYS || 365);

/**
 * Raportează — NU șterge — anunțurile foarte vechi ale parcurilor active.
 *
 * ── DE CE NU ȘTERGE AUTOMAT ───────────────────────────────────────────────
 * Ștergerea e ireversibilă și distruge fotografiile din R2. Un dealer poate
 * avea legitim o mașină în stoc de un an — o rablă scumpă, o mașină de colecție,
 * ceva greu vandabil. Ștergerea automată i-ar șterge marfa reală din site fără
 * ca el să afle, iar recuperarea e imposibilă.
 *
 * Raportul îți spune pe cine să suni. Decizia rămâne a omului.
 *
 * Anunțurile parcurilor INACTIVE nu apar aici: pentru ele, cronul existent își
 * face treaba normal (nu mai sunt protejate → grace period → ștergere).
 */
export const reportStaleSales = async () => {
    const userIds = await activeParcUserIds();
    if (!userIds || userIds.length === 0) return { parcs: 0, sales: 0 };

    const cutoff = subDays(new Date(), STALE_DAYS);

    try {
        const rows = await sales.aggregate([
            { $match: { user_id: { $in: userIds }, is_active: true, createdAt: { $lte: cutoff } } },
            { $group: { _id: '$user_id', n: { $sum: 1 }, oldest: { $min: '$createdAt' } } },
            { $sort: { n: -1 } },
        ]);

        if (rows.length === 0) {
            console.log('📋 [parcMaintenance] Niciun anunț mai vechi de ' + STALE_DAYS + ' de zile.');
            return { parcs: 0, sales: 0 };
        }

        const map = new Map(
            (await parcuri.find({ user_id: { $in: rows.map((r) => r._id) } })
                .select('user_id subdomain display_name').lean())
                .map((p) => [String(p.user_id), p])
        );

        let total = 0;
        console.log('┌─ 📋 ANUNȚURI ÎNVECHITE (peste ' + STALE_DAYS + ' de zile) ─────────────');
        for (const r of rows) {
            const p = map.get(String(r._id));
            const days = Math.floor((Date.now() - new Date(r.oldest).getTime()) / 86400000);
            total += r.n;
            console.log(`│  ${(p?.subdomain || '?').padEnd(18)} ${String(r.n).padStart(3)} anunțuri · cel mai vechi de ${days} zile`);
        }
        console.log('│  Sugestie: sună dealerii — mașinile vândute și nescoase strică site-ul.');
        console.log('└──────────────────────────────────────────────────────────');

        return { parcs: rows.length, sales: total };
    } catch (err) {
        console.error('❌ [parcMaintenance] reportStaleSales:', err.message);
        return { parcs: 0, sales: 0, error: true };
    }
};

/** Sumar zilnic al stării parcurilor. Util în `pm2 logs`. */
export const reportParcHealth = async () => {
    try {
        const [total, active, indexable] = await Promise.all([
            parcuri.countDocuments({}),
            parcuri.countDocuments({ active: true }),
            parcuri.countDocuments({ active: true, indexable: true }),
        ]);
        if (total === 0) return;
        console.log(`🏢 [parcMaintenance] Parcuri: ${total} · active: ${active} · indexabile: ${indexable}`);
    } catch { /* raport pur informativ */ }
};

export default { protectDealerSales, reviveDealerSales, reportStaleSales, reportParcHealth };
