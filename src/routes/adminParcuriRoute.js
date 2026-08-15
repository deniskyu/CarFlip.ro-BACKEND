import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import bcrypt from 'bcrypt';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

import parcuri from '../models/parcModel.js';
import users from '../models/userModel.js';
import sales from '../models/salesModel.js';
import Comments from '../models/commentModel.js';
import SeenPost from '../models/seenPostsModel.js';

import { authAdmin, adminFetchLimiter, adminActionLimiter } from './adminRoute.js';
import { validateSubdomain } from '../utils/reservedSubdomains.js';
import { normalizePhone } from '../utils/phone.js';
import { isValidIcon, DEFAULT_ICON } from '../utils/serviceIcons.js';
import { uploadParcImage, deleteParcImage } from '../utils/parcUpload.js';
import { invalidateParcCache, warmParcCache } from '../services/parcCache.js';
import { getStockStats, computeIndexable, refreshIndexable } from '../services/indexableCheck.js';
import { enqueueSocialCleanup } from '../services/socialPromo/socialPromoService.js';
import { destroyParcSessions } from '../services/dealerSession.js';

// ============================================================================
//  src/routes/adminParcuriRoute.js
// ----------------------------------------------------------------------------
//  Tot ce ține de administrarea parcurilor, din panoul TĂU (nu al dealerului).
//  Toate rutele sunt în spatele lui `authAdmin`.
//
//  Trei lucruri care merită citite înainte de a modifica ceva aici:
//
//  1. `_id`-ul parcului se PRE-GENEREAZĂ la creare, înainte de upload, ca să
//     poată intra în numele cheilor din R2. Altfel ar trebui creat documentul,
//     apoi urcate imaginile, apoi actualizat documentul — trei pași și o
//     fereastră în care parcul există fără branding.
//
//  2. Dacă salvarea eșuează DUPĂ upload, fișierele urcate se șterg explicit.
//     Fără asta, fiecare eroare de validare ar lăsa gunoi permanent în R2.
//
//  3. Ștergerea are TREI forme distincte, pentru că anunțurile aparțin
//     CONTULUI, nu site-ului. Vezi comentariile de la rutele de DELETE.
// ============================================================================

const adminParcuri = Router();

const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

// ─── Upload ─────────────────────────────────────────────────────────────────
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024, files: 2 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) return cb(null, true);
        cb(new Error('Doar imagini sunt permise (logo și banner).'), false);
    },
});

// Împachetat manual ca eroarea de multer să iasă în formatul { success, message },
// nu ca stack trace de la handler-ul implicit de erori Express.
const uploadBranding = (req, res, next) => {
    upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'banner', maxCount: 1 }])(req, res, (err) => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE'
                ? 'Imaginea este prea mare. Limita este de 15MB.'
                : (err.message || 'Fișier invalid.');
            return res.status(400).json({ success: false, message: msg });
        }
        next();
    });
};

// ─── Helpere ────────────────────────────────────────────────────────────────
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };

/** Arrayurile vin din multipart ca string JSON. Parsăm defensiv. */
const arr = (v, max) => {
    let out = v;
    if (typeof v === 'string') {
        try { out = JSON.parse(v); } catch { out = v.split(',').map(s => s.trim()); }
    }
    if (!Array.isArray(out)) return [];
    return out.map(x => String(x).trim()).filter(Boolean).slice(0, max);
};

/**
 * Serviciile vin ca JSON string din multipart.
 * Filtrăm intrările incomplete în loc să respingem tot: dacă cineva lasă un
 * card gol în formular, celelalte două ar trebui să se salveze, nu să pice
 * întregul request cu o eroare de validare confuză.
 *
 * Întoarce undefined dacă nu s-a trimis nimic util → câmpul nu se atinge.
 */
const parseServices = (v) => {
    let out = v;
    if (typeof v === 'string') { try { out = JSON.parse(v); } catch { return undefined; } }
    if (!Array.isArray(out)) return undefined;

    const clean = out
        .filter(s => s && str(s.title) && str(s.text))
        .slice(0, 3)
        .map(s => ({
            icon: isValidIcon(s.icon) ? s.icon : DEFAULT_ICON,
            title: str(s.title).slice(0, 40),
            text: str(s.text).slice(0, 180),
        }));

    // 0 sau 3, niciodată 1 sau 2 — vezi comentariul din parcModel.
    if (clean.length === 0) return [];
    if (clean.length < 3) return undefined;
    return clean;
};

/** Programul vine ca JSON string; îl validăm minimal ca să nu intre gunoi. */
const parseSchedule = (v) => {
    let out = v;
    if (typeof v === 'string') { try { out = JSON.parse(v); } catch { return undefined; } }
    if (!Array.isArray(out)) return undefined;
    const clean = out
        .filter(d => d && Number.isInteger(Number(d.day)) && Number(d.day) >= 0 && Number(d.day) <= 6)
        .map(d => ({
            day: Number(d.day),
            open: /^([01]\d|2[0-3]):[0-5]\d$/.test(d.open) ? d.open : '09:00',
            close: /^([01]\d|2[0-3]):[0-5]\d$/.test(d.close) ? d.close : '18:00',
            closed: d.closed === true || d.closed === 'true',
        }));
    return clean.length ? clean : undefined;
};

/**
 * Traduce corpul request-ului (multipart → totul e string) în câmpuri tipizate.
 * `partial: true` la update — se scriu doar câmpurile trimise efectiv, ca să nu
 * ștergem valori existente cu undefined.
 */
const parseParcBody = (body, { partial = false } = {}) => {
    const b = body || {};
    const out = {};
    const set = (key, value) => {
        if (value === undefined) return;
        if (partial && !(key in b) && !['phone', 'whatsapp'].includes(key)) return;
        out[key] = value;
    };

    if ('subdomain' in b) out.subdomain = str(b.subdomain).toLowerCase();
    if ('display_name' in b) out.display_name = str(b.display_name);
    if ('preset' in b) set('preset', num(b.preset));
    if ('accent_color' in b) out.accent_color = str(b.accent_color);

    for (const k of ['hero_title', 'hero_subtitle', 'about_title', 'about_text', 'contact_intro',
                     'email', 'address', 'city', 'county',
                     'facebook_url', 'instagram_url', 'tiktok_url',
                     'company_name', 'company_cui', 'company_reg', 'company_address',
                     'meta_description', 'notes']) {
        if (k in b) out[k] = str(b[k]);
    }

    if ('phone' in b) out.phone = normalizePhone(b.phone);
    if ('whatsapp' in b) out.whatsapp = normalizePhone(b.whatsapp);
    if ('lat' in b) set('lat', num(b.lat));
    if ('lng' in b) set('lng', num(b.lng));
    if ('founded_year' in b) set('founded_year', num(b.founded_year));

    if ('seo_keywords' in b) out.seo_keywords = arr(b.seo_keywords, 8);
    if ('seo_service_area' in b) out.seo_service_area = arr(b.seo_service_area, 10);
    if ('services_title' in b) out.services_title = str(b.services_title);
    if ('services' in b) set('services', parseServices(b.services));
    if ('schedule' in b) set('schedule', parseSchedule(b.schedule));

    return out;
};

/** Mongoose ValidationError → listă de mesaje lizibile pentru interfață. */
const validationMessages = (err) => {
    if (err?.name === 'ValidationError' && err.errors) {
        return Object.values(err.errors).map(e => e.message);
    }
    if (err?.code === 11000) {
        const field = Object.keys(err.keyPattern || {})[0];
        if (field === 'subdomain') return ['Subdomeniul este deja folosit.'];
        if (field === 'user_id') return ['Acest utilizator are deja un parc asociat.'];
        return ['Valoare duplicată.'];
    }
    return null;
};

// ════════════════════════════════════════════════════════════════════════════
//  CITIRE
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/parcuri
 * Lista completă, îmbogățită cu statistici de stoc într-o SINGURĂ agregare
 * (nu N+1 query-uri). `last_post_at` e indicatorul de retenție: un dealer care
 * n-a mai postat de 45 de zile e un client pe cale să nu reînnoiască.
 */
adminParcuri.get('/api/admin/parcuri', adminFetchLimiter, authAdmin, async (req, res) => {
    try {
        const list = await parcuri.find().sort({ createdAt: -1 }).lean();
        if (list.length === 0) return res.json({ success: true, parcuri: [] });

        const userIds = list.map(p => p.user_id);
        const [statsMap, userDocs] = await Promise.all([
            getStockStats(userIds),
            users.find({ _id: { $in: userIds } }).select('username email isBanned').lean(),
        ]);
        const userMap = new Map(userDocs.map(u => [String(u._id), u]));

        const enriched = await Promise.all(list.map(async (p) => {
            const stats = statsMap.get(String(p.user_id)) || { total: 0, rich: 0, last_post_at: null };
            const check = await computeIndexable(p, stats);
            const u = userMap.get(String(p.user_id));

            const daysSincePost = stats.last_post_at
                ? Math.floor((Date.now() - new Date(stats.last_post_at).getTime()) / 86400000)
                : null;

            return {
                ...parcuri.toPublic(p),
                createdAt: p.createdAt,
                notes: p.notes || '',            // vizibil DOAR aici, în panoul tău
                user: u ? { username: u.username, email: u.email, isBanned: u.isBanned } : null,
                stock: {
                    total: stats.total,
                    rich: stats.rich,
                    last_post_at: stats.last_post_at,
                    days_since_post: daysSincePost,
                    stale: daysSincePost !== null && daysSincePost > 45,
                },
                indexable_check: { ok: check.indexable, reasons: check.reasons },
            };
        }));

        return res.json({ success: true, parcuri: enriched });
    } catch (err) {
        console.error('Admin parcuri list error:', err);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});

/** GET /api/admin/parcuri/check-subdomain?sub=bogdan */
adminParcuri.get('/api/admin/parcuri/check-subdomain', adminFetchLimiter, authAdmin, async (req, res) => {
    const { sub, exclude } = req.query;
    const check = validateSubdomain(typeof sub === 'string' ? sub : '');
    if (!check.valid) return res.json({ success: true, available: false, message: check.error });

    try {
        const q = { subdomain: check.value };
        if (typeof exclude === 'string' && isValidObjectId(exclude)) q._id = { $ne: exclude };
        const taken = await parcuri.exists(q);
        return res.json({
            success: true,
            available: !taken,
            value: check.value,
            message: taken ? 'Subdomeniul este deja folosit.' : 'Disponibil.',
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});

/**
 * GET /api/admin/parcuri/users?q=text
 * Căutare de utilizatori pentru formular. Diferită de /api/admin/user/search
 * existent: caută parțial, arată câte anunțuri are fiecare și dacă are deja un
 * parc — exact informația de care ai nevoie ca să alegi contul potrivit.
 */
adminParcuri.get('/api/admin/parcuri/users', adminFetchLimiter, authAdmin, async (req, res) => {
    const { q } = req.query;
    if (typeof q !== 'string' || q.trim().length < 2) {
        return res.json({ success: true, users: [] });
    }
    try {
        const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(escaped, 'i');

        const found = await users.find({ $or: [{ username: rx }, { email: rx }] })
            .select('username email icon isBanned createdAt')
            .limit(15).lean();

        if (found.length === 0) return res.json({ success: true, users: [] });

        const ids = found.map(u => u._id);
        const [statsMap, taken] = await Promise.all([
            getStockStats(ids),
            parcuri.find({ user_id: { $in: ids } }).select('user_id subdomain').lean(),
        ]);
        const takenMap = new Map(taken.map(p => [String(p.user_id), p.subdomain]));

        return res.json({
            success: true,
            users: found.map(u => ({
                _id: u._id,
                username: u.username,
                email: u.email,
                icon: u.icon,
                isBanned: u.isBanned,
                active_sales: statsMap.get(String(u._id))?.total || 0,
                existing_parc: takenMap.get(String(u._id)) || null,
            })),
        });
    } catch (err) {
        console.error('Admin parcuri user search error:', err);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});

/** GET /api/admin/parcuri/:id */
adminParcuri.get('/api/admin/parcuri/:id', adminFetchLimiter, authAdmin, async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: 'ID invalid.' });
    try {
        const parc = await parcuri.findById(id).lean();
        if (!parc) return res.status(404).json({ success: false, message: 'Parcul nu există.' });

        const u = await users.findById(parc.user_id).select('username email').lean();
        const check = await computeIndexable(parc);

        return res.json({
            success: true,
            parc: { ...parc, user: u || null },
            indexable_check: { ok: check.indexable, reasons: check.reasons, stats: check.stats },
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  CONT PENTRU DEALER
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/admin/parcuri/create-user
 * Creează un cont VERIFICAT pentru un dealer, sărind peste fluxul de OTP.
 *
 * De ce e nevoie: fluxul normal de înregistrare trimite un cod pe email și
 * cere confirmare. Pentru un dealer pe care îl înscrii tu, la el în parc, e
 * o piedică inutilă. Contul creat aici e identic cu unul normal — se poate
 * loga în aplicație, își poate schimba parola, totul.
 *
 * Parola generată se întoarce O SINGURĂ DATĂ, în răspuns. Nu se stochează
 * în clar nicăieri.
 */
adminParcuri.post('/api/admin/parcuri/create-user', adminActionLimiter, authAdmin, async (req, res) => {
    const username = str(req.body?.username);
    const email = str(req.body?.email).toLowerCase();

    if (!username || !email) {
        return res.status(400).json({ success: false, message: 'Username și email sunt obligatorii.' });
    }
    if (username.length < 3 || username.length > 16 || !/^[a-zA-Z0-9_.]+$/.test(username)) {
        return res.status(400).json({ success: false, message: 'Username invalid: 3-16 caractere, doar litere, cifre, punct și underscore.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: 'Email invalid.' });
    }

    try {
        const clash = await users.findOne({ $or: [{ username }, { email }] }).select('username email').lean();
        if (clash) {
            return res.status(400).json({
                success: false,
                message: clash.email === email ? 'Există deja un cont cu acest email.' : 'Username-ul este deja folosit.',
            });
        }

        // Alfabet fără caractere ambigue (0/O, 1/l/I) — parola se dictează
        // adesea la telefon sau se scrie pe o hârtie.
        const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
        const plain = Array.from({ length: 12 },
            () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(plain, salt);

        const user = await users.create({
            username, email, password: hashed,
            isVerified: true,   // creat de admin → considerat verificat
        });

        return res.json({
            success: true,
            message: 'Cont creat. Notează parola — nu mai poate fi afișată.',
            user: { _id: user._id, username: user.username, email: user.email },
            password: plain,
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Username sau email deja folosit.' });
        }
        console.error('Admin create dealer user error:', err);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  CREARE
// ════════════════════════════════════════════════════════════════════════════

adminParcuri.post('/api/admin/parcuri', adminActionLimiter, authAdmin, uploadBranding, async (req, res) => {
    const uploaded = [];  // pentru rollback dacă salvarea eșuează

    try {
        const data = parseParcBody(req.body);
        const userId = str(req.body?.user_id);

        if (!isValidObjectId(userId)) {
            return res.status(400).json({ success: false, message: 'Selectează un utilizator valid.' });
        }

        const subCheck = validateSubdomain(data.subdomain || '');
        if (!subCheck.valid) return res.status(400).json({ success: false, message: subCheck.error });
        data.subdomain = subCheck.value;

        const [userExists, subTaken, userTaken] = await Promise.all([
            users.exists({ _id: userId }),
            parcuri.exists({ subdomain: data.subdomain }),
            parcuri.exists({ user_id: userId }),
        ]);
        if (!userExists) return res.status(404).json({ success: false, message: 'Utilizatorul nu există.' });
        if (subTaken) return res.status(400).json({ success: false, message: 'Subdomeniul este deja folosit.' });
        if (userTaken) return res.status(400).json({ success: false, message: 'Acest utilizator are deja un parc. Un cont = un parc.' });

        const logoFile = req.files?.logo?.[0];
        const bannerFile = req.files?.banner?.[0];
        if (!logoFile || !bannerFile) {
            return res.status(400).json({ success: false, message: 'Logo-ul și bannerul sunt obligatorii.' });
        }

        // Pre-generăm _id-ul ca să putem numi cheile din R2 înainte de save.
        const parcId = new mongoose.Types.ObjectId();

        const [logo, banner] = await Promise.all([
            uploadParcImage({ buffer: logoFile.buffer, kind: 'logo', parcId: String(parcId) }),
            uploadParcImage({ buffer: bannerFile.buffer, kind: 'banner', parcId: String(parcId) }),
        ]);
        uploaded.push(logo.public_id, banner.public_id);

        const parc = await parcuri.create({
            _id: parcId,
            ...data,
            user_id: userId,
            logo_url: logo.url,
            logo_public_id: logo.public_id,
            banner_url: banner.url,
            banner_public_id: banner.public_id,
            active: true,
            indexable: false,   // se recalculează imediat mai jos
        });

        const check = await refreshIndexable(parc.toObject());
        await invalidateParcCache(parc.subdomain);
        await warmParcCache(parc);

        return res.json({
            success: true,
            message: `Site creat: ${parc.subdomain}.car-flip.com`,
            parc: parc.toPublicJSON(),
            indexable_check: { ok: check.indexable, reasons: check.reasons },
        });

    } catch (err) {
        // Salvarea a eșuat după upload → curățăm R2, altfel rămân fișiere orfane.
        for (const key of uploaded) await deleteParcImage(key);

        const msgs = validationMessages(err);
        if (msgs) return res.status(400).json({ success: false, message: msgs[0], errors: msgs });

        console.error('Admin parc create error:', err);
        return res.status(500).json({ success: false, message: err.message || 'Eroare la crearea parcului.' });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  ACTUALIZARE
// ════════════════════════════════════════════════════════════════════════════

adminParcuri.put('/api/admin/parcuri/:id', adminActionLimiter, authAdmin, uploadBranding, async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: 'ID invalid.' });

    const uploaded = [];
    const toDeleteAfterSave = [];

    try {
        const parc = await parcuri.findById(id);
        if (!parc) return res.status(404).json({ success: false, message: 'Parcul nu există.' });

        const oldSubdomain = parc.subdomain;
        const data = parseParcBody(req.body, { partial: true });

        // Schimbarea subdomeniului: validare + verificare disponibilitate.
        if (data.subdomain && data.subdomain !== oldSubdomain) {
            const subCheck = validateSubdomain(data.subdomain);
            if (!subCheck.valid) return res.status(400).json({ success: false, message: subCheck.error });
            const taken = await parcuri.exists({ subdomain: subCheck.value, _id: { $ne: id } });
            if (taken) return res.status(400).json({ success: false, message: 'Subdomeniul este deja folosit.' });
            data.subdomain = subCheck.value;
        }

        // Mutarea pe alt cont — rar, dar posibil (dealer care își face cont nou).
        const newUserId = str(req.body?.user_id);
        if (newUserId && isValidObjectId(newUserId) && String(parc.user_id) !== newUserId) {
            const [exists, taken] = await Promise.all([
                users.exists({ _id: newUserId }),
                parcuri.exists({ user_id: newUserId, _id: { $ne: id } }),
            ]);
            if (!exists) return res.status(404).json({ success: false, message: 'Utilizatorul nu există.' });
            if (taken) return res.status(400).json({ success: false, message: 'Utilizatorul are deja un parc.' });
            parc.user_id = newUserId;
        }

        const logoFile = req.files?.logo?.[0];
        const bannerFile = req.files?.banner?.[0];

        if (logoFile) {
            const logo = await uploadParcImage({ buffer: logoFile.buffer, kind: 'logo', parcId: String(parc._id) });
            uploaded.push(logo.public_id);
            toDeleteAfterSave.push(parc.logo_public_id);
            parc.logo_url = logo.url;
            parc.logo_public_id = logo.public_id;
        }
        if (bannerFile) {
            const banner = await uploadParcImage({ buffer: bannerFile.buffer, kind: 'banner', parcId: String(parc._id) });
            uploaded.push(banner.public_id);
            toDeleteAfterSave.push(parc.banner_public_id);
            parc.banner_url = banner.url;
            parc.banner_public_id = banner.public_id;
        }

        Object.assign(parc, data);
        await parc.save();

        // Imaginile vechi se șterg DOAR după ce salvarea a reușit. Invers ar
        // însemna că o eroare de validare lasă parcul fără logo.
        for (const key of toDeleteAfterSave) await deleteParcImage(key);

        const check = await refreshIndexable(parc.toObject());
        // La redenumire trebuie invalidate AMÂNDOUĂ cheile: altfel vechiul
        // subdomeniu continuă să servească site-ul încă 5 minute.
        await invalidateParcCache(oldSubdomain, parc.subdomain);
        await warmParcCache(parc);

        return res.json({
            success: true,
            message: 'Parc actualizat.',
            parc: parc.toPublicJSON(),
            indexable_check: { ok: check.indexable, reasons: check.reasons },
        });

    } catch (err) {
        for (const key of uploaded) await deleteParcImage(key);
        const msgs = validationMessages(err);
        if (msgs) return res.status(400).json({ success: false, message: msgs[0], errors: msgs });
        console.error('Admin parc update error:', err);
        return res.status(500).json({ success: false, message: err.message || 'Eroare la actualizare.' });
    }
});

/**
 * POST /api/admin/parcuri/:id/toggle
 * Acțiunea folosită în ~95% din cazurile în care un client pleacă.
 * Site-ul dă 404 instant, dar NIMIC nu se pierde: anunțurile rămân, brandingul
 * rămâne, subdomeniul rămâne rezervat. Reversibil dintr-un click.
 */
adminParcuri.post('/api/admin/parcuri/:id/toggle', adminActionLimiter, authAdmin, async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: 'ID invalid.' });
    try {
        const parc = await parcuri.findById(id);
        if (!parc) return res.status(404).json({ success: false, message: 'Parcul nu există.' });

        parc.active = !parc.active;
        if (!parc.active) parc.indexable = false;   // dezactivat → sigur nu indexabil
        await parc.save();

        // Site dezactivat → sesiunile dealerului mor instant. Fără asta, ar
        // putea continua să lucreze într-un panou al unui site inexistent.
        if (!parc.active) await destroyParcSessions(parc._id);

        await invalidateParcCache(parc.subdomain);
        if (parc.active) {
            await refreshIndexable(parc.toObject());
            await warmParcCache(parc);
        }

        return res.json({
            success: true,
            active: parc.active,
            message: parc.active ? 'Site activat.' : 'Site dezactivat. Anunțurile NU au fost atinse.',
        });
    } catch (err) {
        console.error('Admin parc toggle error:', err);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});

/** POST /api/admin/parcuri/:id/refresh-indexable — recalculare manuală. */
adminParcuri.post('/api/admin/parcuri/:id/refresh-indexable', adminFetchLimiter, authAdmin, async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: 'ID invalid.' });
    try {
        const result = await refreshIndexable(id);
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  ȘTERGERE — două rute, trei comportamente
// ────────────────────────────────────────────────────────────────────────────
//  Anunțurile aparțin CONTULUI de utilizator, nu site-ului. Un dealer care
//  renunță la site rămâne un utilizator CarFlip cu stocul lui. De aceea
//  ștergerea site-ului NU atinge anunțurile — ar fi o pagubă nejustificată.
// ════════════════════════════════════════════════════════════════════════════

/**
 * DELETE /api/admin/parcuri/:id
 * Șterge DOAR site-ul: documentul + logo-ul și bannerul din R2.
 * Anunțurile, contul și tot restul rămân neatinse. Subdomeniul se eliberează.
 */
adminParcuri.delete('/api/admin/parcuri/:id', adminActionLimiter, authAdmin, async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: 'ID invalid.' });
    try {
        const parc = await parcuri.findById(id).lean();
        if (!parc) return res.status(404).json({ success: false, message: 'Parcul nu există.' });

        await parcuri.deleteOne({ _id: id });
        await destroyParcSessions(parc._id);
        await invalidateParcCache(parc.subdomain);
        await deleteParcImage(parc.logo_public_id);
        await deleteParcImage(parc.banner_public_id);

        return res.json({
            success: true,
            message: `Site-ul "${parc.subdomain}" a fost șters. Anunțurile și contul NU au fost atinse.`,
        });
    } catch (err) {
        console.error('Admin parc delete error:', err);
        return res.status(500).json({ success: false, message: 'Eroare la ștergere.' });
    }
});

/**
 * DELETE /api/admin/parcuri/:id/with-stock
 * Acțiune EXCEPȚIONALĂ și IREVERSIBILĂ: șterge site-ul ȘI tot stocul.
 *
 * Cere confirmare prin tastarea subdomeniului în body (`confirm`), exact ca la
 * ștergerea unui repository. Un popup cu „Da/Nu" nu e suficient pentru ceva
 * care distruge sute de fotografii definitiv.
 *
 * Contul de utilizator NU se șterge — pentru asta există fluxul dedicat din
 * aplicație, cu toate curățeniile lui (mesaje, conversații, notificări).
 *
 * Replică fidel logica din DELETE /api/sales/remove/:id, dar în loturi:
 * R2 → comentarii → seen posts → cleanup social → documentele.
 */
adminParcuri.delete('/api/admin/parcuri/:id/with-stock', adminActionLimiter, authAdmin, async (req, res) => {
    const { id } = req.params;
    const confirm = str(req.body?.confirm);
    if (!isValidObjectId(id)) return res.status(400).json({ success: false, message: 'ID invalid.' });

    try {
        const parc = await parcuri.findById(id).lean();
        if (!parc) return res.status(404).json({ success: false, message: 'Parcul nu există.' });

        if (confirm !== parc.subdomain) {
            return res.status(400).json({
                success: false,
                message: `Confirmare greșită. Scrie exact „${parc.subdomain}" ca să confirmi ștergerea definitivă.`,
            });
        }

        const CHUNK = 50;
        let deletedSales = 0;
        let deletedMedia = 0;

        while (true) {
            const batch = await sales.find({ user_id: parc.user_id })
                .select('_id media social_promo status').limit(CHUNK).lean();
            if (batch.length === 0) break;

            const ids = batch.map(s => s._id);

            // 1. Postările sociale — ÎNAINTE de ștergere, altfel se pierde
            //    zernio_post_id-ul și rămân publicate pe Facebook pe veci.
            for (const s of batch) await enqueueSocialCleanup(s);

            // 2. Media din R2, în paralel, best-effort.
            const keys = batch.flatMap(s => (s.media || []).map(m => m.public_id).filter(Boolean));
            await Promise.all(keys.map(k =>
                r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: k }))
                    .then(() => { deletedMedia++; })
                    .catch(() => {})
            ));

            // 3. Date orfane.
            await Comments.deleteMany({ sale_id: { $in: ids } });
            await SeenPost.deleteMany({ sale_id: { $in: ids } });

            // 4. Anunțurile.
            const r = await sales.deleteMany({ _id: { $in: ids } });
            deletedSales += r.deletedCount || 0;
        }

        await parcuri.deleteOne({ _id: id });
        await destroyParcSessions(parc._id);
        await invalidateParcCache(parc.subdomain);
        await deleteParcImage(parc.logo_public_id);
        await deleteParcImage(parc.banner_public_id);

        console.log(`🗑️ [admin] Parc "${parc.subdomain}" șters cu tot stocul: ${deletedSales} anunțuri, ${deletedMedia} fișiere R2.`);

        return res.json({
            success: true,
            message: `Site-ul "${parc.subdomain}" și ${deletedSales} anunțuri au fost șterse definitiv. Contul de utilizator rămâne activ.`,
            deleted: { sales: deletedSales, media: deletedMedia },
        });
    } catch (err) {
        console.error('Admin parc delete with stock error:', err);
        return res.status(500).json({ success: false, message: 'Eroare la ștergere.' });
    }
});

export default adminParcuri;
