import sales from '../models/salesModel.js';
import redisCache from '../config/redisCache.js';
import { slugify } from '../utils/slug.js';

// ============================================================================
//  src/services/stockFilters.js
// ----------------------------------------------------------------------------
//  Calculează opțiunile de filtrare DIN STOCUL REAL al dealerului.
//
//  ── DE CE NU SERVIM COLECȚIA `brands` ─────────────────────────────────────
//  Baza are ~200 de mărci. Un dealer are 30 de mașini din 8 mărci. Un dropdown
//  cu 200 de intrări din care 192 dau zero rezultate nu e „complet", e
//  inutilizabil: omul alege Ferrari, primește pagină goală și pleacă.
//
//  Servim doar ce există, cu numărul lângă — „BMW (7)". Utilizatorul vede din
//  prima ce are rost să caute.
//
//  ── DE CE O SINGURĂ AGREGARE ──────────────────────────────────────────────
//  Mărcile, modelele, intervalele de preț/an/km și totalul ies dintr-un singur
//  `$group` peste stocul dealerului. Query-ul e acoperit de indexul
//  { user_id, is_active, ... } adăugat în Batch 1.
//
//  Rezultatul se cache-uiește: se schimbă doar când dealerul adaugă sau șterge
//  o mașină, iar atunci invalidăm explicit (vezi services/seo/onStockChange.js).
// ============================================================================

const CACHE_PREFIX = 'parc:filters:';
const TTL = 600; // 10 minute — invalidarea explicită face oricum treaba

const key = (userId) => `${CACHE_PREFIX}${userId}`;

/** Praguri peste care se generează pagini dedicate de marcă / model. */
export const BRAND_PAGE_MIN = 3;
export const MODEL_PAGE_MIN = 2;

const buildFilters = async (userId) => {
    const rows = await sales.aggregate([
        { $match: { user_id: userId, is_active: true } },
        {
            $group: {
                _id: { brandId: '$brand.id', brandName: '$brand.name', modelId: '$model.id', modelName: '$model.name' },
                count: { $sum: 1 },
                minPrice: { $min: '$price' },
                maxPrice: { $max: '$price' },
                minYear: { $min: '$production_year' },
                maxYear: { $max: '$production_year' },
                minKm: { $min: '$mileage' },
                maxKm: { $max: '$mileage' },
                fuels: { $addToSet: '$engine.fuel_type' },
            },
        },
    ]);

    const brands = new Map();
    let total = 0;
    let minPrice = Infinity, maxPrice = 0;
    let minYear = Infinity, maxYear = 0;
    let minKm = Infinity, maxKm = 0;
    const fuelSet = new Set();

    for (const r of rows) {
        const { brandId, brandName, modelId, modelName } = r._id;
        if (!brandName) continue;

        total += r.count;
        minPrice = Math.min(minPrice, r.minPrice ?? Infinity);
        maxPrice = Math.max(maxPrice, r.maxPrice ?? 0);
        minYear = Math.min(minYear, r.minYear ?? Infinity);
        maxYear = Math.max(maxYear, r.maxYear ?? 0);
        minKm = Math.min(minKm, r.minKm ?? Infinity);
        maxKm = Math.max(maxKm, r.maxKm ?? 0);
        for (const f of r.fuels || []) if (f) fuelSet.add(f);

        const bSlug = slugify(brandName);
        if (!brands.has(bSlug)) {
            brands.set(bSlug, {
                id: brandId, name: brandName, slug: bSlug,
                count: 0, models: new Map(),
                minPrice: Infinity, maxPrice: 0, minYear: Infinity, maxYear: 0,
            });
        }
        const b = brands.get(bSlug);
        b.count += r.count;
        b.minPrice = Math.min(b.minPrice, r.minPrice ?? Infinity);
        b.maxPrice = Math.max(b.maxPrice, r.maxPrice ?? 0);
        b.minYear = Math.min(b.minYear, r.minYear ?? Infinity);
        b.maxYear = Math.max(b.maxYear, r.maxYear ?? 0);

        if (modelName) {
            const mSlug = slugify(modelName);
            const existing = b.models.get(mSlug);
            if (existing) existing.count += r.count;
            else b.models.set(mSlug, { id: modelId, name: modelName, slug: mSlug, count: r.count });
        }
    }

    const brandList = [...brands.values()]
        .map((b) => ({
            ...b,
            minPrice: Number.isFinite(b.minPrice) ? b.minPrice : 0,
            minYear: Number.isFinite(b.minYear) ? b.minYear : 0,
            models: [...b.models.values()].sort((a, z) => z.count - a.count || a.name.localeCompare(z.name, 'ro')),
        }))
        // Ordonate după stoc, nu alfabetic: prima marcă din listă trebuie să fie
        // cea pe care dealerul chiar o vinde.
        .sort((a, z) => z.count - a.count || a.name.localeCompare(z.name, 'ro'));

    return {
        total,
        brands: brandList,
        price: { min: Number.isFinite(minPrice) ? minPrice : 0, max: maxPrice },
        year: { min: Number.isFinite(minYear) ? minYear : 0, max: maxYear },
        km: { min: Number.isFinite(minKm) ? minKm : 0, max: maxKm },
        fuels: [...fuelSet].sort(),
        generated_at: Date.now(),
    };
};

/** Filtrele pentru un dealer, cu cache și degradare grațioasă. */
export const getStockFilters = async (userId) => {
    const id = String(userId);
    try {
        const cached = await redisCache.get(key(id));
        if (cached) return JSON.parse(cached);
    } catch { /* Redis jos → mergem la Mongo */ }

    let data;
    try {
        data = await buildFilters(userId);
    } catch (err) {
        console.error(`❌ [stockFilters] ${id}:`, err.message);
        return { total: 0, brands: [], price: { min: 0, max: 0 }, year: { min: 0, max: 0 }, km: { min: 0, max: 0 }, fuels: [] };
    }

    try {
        await redisCache.set(key(id), JSON.stringify(data), 'EX', TTL);
    } catch { /* irelevant */ }

    return data;
};

export const invalidateStockFilters = async (userId) => {
    try { await redisCache.del(key(String(userId))); }
    catch (err) { console.warn('⚠️ [stockFilters] invalidare eșuată:', err.message); }
};

/** slug de marcă → intrarea din stoc, sau null dacă dealerul nu are marca. */
export const findBrandBySlug = (filters, brandSlug) =>
    filters?.brands?.find((b) => b.slug === brandSlug) || null;

export const findModelBySlug = (brand, modelSlug) =>
    brand?.models?.find((m) => m.slug === modelSlug) || null;

/** Mărcile care merită pagină proprie (au destul stoc ca pagina să nu fie subțire). */
export const brandsWithPages = (filters) =>
    (filters?.brands || []).filter((b) => b.count >= BRAND_PAGE_MIN);

export const modelsWithPages = (brand) =>
    (brand?.models || []).filter((m) => m.count >= MODEL_PAGE_MIN);

export default {
    getStockFilters, invalidateStockFilters,
    findBrandBySlug, findModelBySlug, brandsWithPages, modelsWithPages,
    BRAND_PAGE_MIN, MODEL_PAGE_MIN,
};
