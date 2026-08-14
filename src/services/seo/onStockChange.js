import parcuri from '../../models/parcModel.js';
import { invalidateStockFilters } from '../stockFilters.js';
import { invalidateParcCache } from '../parcCache.js';
import { refreshIndexable } from '../indexableCheck.js';
import { pingIndexNow } from './indexnow.js';

// ============================================================================
//  src/services/seo/onStockChange.js
// ----------------------------------------------------------------------------
//  UN SINGUR punct de intrare pentru „stocul unui dealer s-a schimbat".
//
//  Se apelează din patru locuri diferite (worker media, ștergere anunț,
//  reactivare, cron). Dacă fiecare ar face pașii pe cont propriu, garantat unul
//  ar uita invalidarea cache-ului și cineva ar depana ore întregi de ce site-ul
//  arată stoc vechi.
//
//  Ce face, în ordine:
//    1. găsește parcul dealerului (majoritatea userilor NU au parc → iese rapid)
//    2. invalidează filtrele de stoc din cache
//    3. recalculează `indexable` (a trecut de 10 mașini? a coborât sub prag?)
//    4. anunță IndexNow
//
//  BEST-EFFORT în întregime. Un eșec aici nu are voie să rupă postarea unui
//  anunț — de aceea totul e învelit în try/catch și nu aruncă niciodată.
// ============================================================================

/**
 * @param {ObjectId|string} userId
 * @param {object} [opts]
 * @param {string[]} [opts.slugs]  slug-urile mașinilor afectate → anunțate individual
 * @param {boolean}  [opts.removed] true la ștergere: se anunță doar paginile de listă
 */
export const onStockChange = async (userId, { slugs = [], removed = false } = {}) => {
    if (!userId) return;

    try {
        // Filtrul e pe un index unic → foarte ieftin. Pentru userii obișnuiți
        // (fără parc) funcția se oprește aici, în câteva microsecunde.
        const parc = await parcuri.findOne({ user_id: userId })
            .select('_id subdomain user_id active indexable phone whatsapp address city county lat lng schedule logo_url banner_url company_name company_cui company_reg company_address')
            .lean();

        if (!parc) return;

        await invalidateStockFilters(userId);

        const before = parc.indexable;
        const check = await refreshIndexable(parc);
        if (check.changed) await invalidateParcCache(parc.subdomain);

        if (parc.active === false) return;

        // Anunțăm doar dacă site-ul e (sau tocmai a devenit) indexabil. Un site
        // pe `noindex` nu are ce căuta în cozile motoarelor de căutare.
        if (!check.indexable && !before) return;

        const host = `${parc.subdomain}.car-flip.com`;
        const urls = [`https://${host}/`, `https://${host}/stoc`];
        if (!removed) {
            for (const s of slugs.filter(Boolean).slice(0, 20)) {
                urls.push(`https://${host}/masina/${s}`);
            }
        }

        // Fără await pe rezultat: notificarea nu trebuie să încetinească fluxul
        // care a declanșat-o.
        pingIndexNow(host, urls).catch(() => {});

    } catch (err) {
        console.warn('⚠️ [onStockChange]', err.message);
    }
};

export default { onStockChange };
