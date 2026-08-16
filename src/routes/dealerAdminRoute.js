import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import { addMonths, addDays } from 'date-fns';

import users from '../models/userModel.js';
import sales from '../models/salesModel.js';
import parcuri from '../models/parcModel.js';
import brandsModel from '../models/brandsModel.js';

import { loadDealer, requireDealer, checkOrigin } from '../middleware/authDealer.js';
import {
    createSession, destroySession, setSessionCookie, clearSessionCookie,
} from '../services/dealerSession.js';
import { validateSaleFields, validateSaleFiles, sanitize } from '../validation/saleValidation.js';
import { isValidIcon, DEFAULT_ICON } from '../utils/serviceIcons.js';
import { addMediaToQueue, addMediaUpdateToQueue } from '../mediaProcessing/mediaQueue.js';
import { onStockChange } from '../services/seo/onStockChange.js';
import { deleteSaleCompletely } from '../services/saleDeletion.js';
import { invalidateParcCache, warmParcCache } from '../services/parcCache.js';
import { uploadParcImage, deleteParcImage } from '../utils/parcUpload.js';
import { normalizePhone } from '../utils/phone.js';
import { dealerLoginLimiter, dealerActionLimiter } from '../utils/rateLimiters.js';
import { renderLogin, renderList, renderCarForm, renderSettings } from '../site/admin/pages.js';

// ============================================================================
//  src/routes/dealerAdminRoute.js
// ----------------------------------------------------------------------------
//  Panoul dealerului, pe <subdomeniu>.car-flip.com/admin
//
//  ── PRINCIPIUL DE SECURITATE ──────────────────────────────────────────────
//  Fiecare query poartă `user_id` din SESIUNE, ca parte din FILTRU — niciodată
//  ca verificare după găsirea documentului. Un anunț al altui dealer pur și
//  simplu nu se găsește.
//
//  Diferența e importantă: cu `findById(id)` urmat de `if (sale.user_id !== ...)`,
//  o singură rută unde verificarea lipsește deschide accesul. Cu `user_id` în
//  filtru, o rută scrisă greșit întoarce `null`, nu datele altcuiva.
//
//  ── CE POATE ȘI CE NU POATE DEALERUL ──────────────────────────────────────
//  POATE: adăuga, edita și șterge propriile anunțuri; schimba textele de pe
//         site, bannerul și numerele de contact.
//  NU POATE: schimba culori, layout, presetare, logo, adresă, program, date de
//         firmă, `indexable`, subdomeniu. Fiecare câmp editabil în plus e o
//         modalitate în plus de a strica site-ul — iar site-urile sunt
//         portofoliul cu care vinzi.
// ============================================================================

const dealerAdmin = Router();

// ─── Upload ─────────────────────────────────────────────────────────────────
// Disk storage, identic cu ruta existentă de postare: fișierele ajung în
// temp_uploads/raw, iar worker-ul le procesează din coadă. Memoria nu ține 13
// poze × 15MB × 12 procese.
const TEMP_DIR = path.join(process.cwd(), 'temp_uploads', 'raw');
fs.mkdirSync(TEMP_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMP_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `raw_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`);
    },
});

const uploadMedia = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024, files: 13 },
    fileFilter: (req, file, cb) => {
        const ok = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
        cb(ok ? null : new Error('Doar fotografii și videoclipuri sunt permise.'), ok);
    },
}).array('mediaFiles', 13);

const uploadBanner = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) =>
        cb(file.mimetype.startsWith('image/') ? null : new Error('Doar imagini.'), file.mimetype.startsWith('image/')),
}).single('banner');

/** Împachetează multer ca erorile să iasă în formatul aplicației, nu ca stack trace. */
const wrap = (mw) => (req, res, next) => mw(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Un fișier depășește limita permisă.'
        : err.code === 'LIMIT_FILE_COUNT'
            ? 'Maxim 13 fișiere.'
            : (err.message || 'Fișier invalid.');
    return res.status(400).json({ success: false, message: msg });
});

/** Curăță fișierele temporare când cererea eșuează după upload. */
const cleanupTemp = (files) => {
    for (const f of files || []) {
        fs.promises.unlink(f.path).catch(() => {});
    }
};

const isId = (v) => mongoose.Types.ObjectId.isValid(v);
const fmtPrice = (n) => `${new Intl.NumberFormat('de-DE').format(n)} €`;
const fmtNum = (n) => new Intl.NumberFormat('de-DE').format(n);

// Mesaj scurt trecut prin URL după un redirect (fără sesiuni de tip flash).
const flashFrom = (q) => {
    if (q.ok) return { type: 'ok', text: String(q.ok).slice(0, 200) };
    if (q.err) return { type: 'err', text: String(q.err).slice(0, 200) };
    return null;
};

// ════════════════════════════════════════════════════════════════════════════
//  Toate rutele /admin: cer un parc rezolvat + încarcă sesiunea
// ════════════════════════════════════════════════════════════════════════════
dealerAdmin.use('/admin', (req, res, next) => {
    if (!req.isSite || !req.parc) return next('router');
    // Panoul nu are ce căuta în index, indiferent de pagină.
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Cache-Control', 'private, no-store');
    next();
}, loadDealer);

// ════════════════════════════════════════════════════════════════════════════
//  AUTENTIFICARE
// ════════════════════════════════════════════════════════════════════════════

dealerAdmin.get('/admin', (req, res) => {
    if (req.dealer) return res.redirect('/admin/masini');
    return res.status(200).type('text/html; charset=utf-8')
        .send(renderLogin(req.parc, { error: req.query.err ? String(req.query.err).slice(0, 200) : null }));
});

dealerAdmin.post('/admin/login', dealerLoginLimiter, checkOrigin, async (req, res) => {
    const parc = req.parc;
    const email = sanitize(req.body?.email).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const fail = (msg) => res.status(200).type('text/html; charset=utf-8')
        .send(renderLogin(parc, { error: msg, email }));

    if (!email || !password) return fail('Completează emailul și parola.');

    try {
        const user = await users.findOne({ email }).select('_id email password isBanned googleId appleId').lean();

        // Mesaj identic pentru „email inexistent" și „parolă greșită": altfel
        // cineva poate afla ce emailuri au cont încercând pe rând.
        const generic = 'Email sau parolă incorecte.';
        if (!user) return fail(generic);
        if (user.isBanned) return fail('Acest cont este suspendat.');

        if (!user.password) {
            return fail(user.googleId || user.appleId
                ? 'Contul folosește autentificare Google sau Apple. Setează o parolă din aplicația CarFlip, apoi revino.'
                : generic);
        }

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return fail(generic);

        // Contul trebuie să fie EXACT cel legat de acest parc.
        if (String(parc.user_id) !== String(user._id)) {
            return fail('Acest cont nu are acces la panoul acestui site.');
        }

        const sid = await createSession(user._id, parc._id);
        setSessionCookie(res, sid);
        return res.redirect('/admin/masini');

    } catch (err) {
        console.error('[dealerAdmin] login:', err.message);
        return fail('Eroare la autentificare. Încearcă din nou.');
    }
});

dealerAdmin.post('/admin/logout', checkOrigin, async (req, res) => {
    if (req.dealer?.sid) await destroySession(req.dealer.sid);
    clearSessionCookie(res);
    return res.redirect('/admin');
});

// ── De aici încolo, totul cere autentificare ────────────────────────────────
dealerAdmin.use('/admin/masini', requireDealer);
dealerAdmin.use('/admin/adauga', requireDealer);
dealerAdmin.use('/admin/masina', requireDealer);
dealerAdmin.use('/admin/setari', requireDealer);

// ════════════════════════════════════════════════════════════════════════════
//  LISTA MAȘINILOR
// ════════════════════════════════════════════════════════════════════════════

dealerAdmin.get('/admin/masini', async (req, res, next) => {
    try {
        const uid = req.dealer.user._id;
        const list = await sales.find({ user_id: uid })
            .select('title brand model production_year mileage price engine media status is_active')
            .sort({ _id: -1 }).limit(200).lean();

        const cars = list.map((s) => ({
            id: String(s._id),
            title: s.title || [s.brand?.name, s.model?.name].filter(Boolean).join(' '),
            year: s.production_year,
            km: Number.isFinite(s.mileage) ? `${fmtNum(s.mileage)} km` : '',
            fuel: s.engine?.fuel_type || '',
            price: fmtPrice(s.price),
            cover: (s.media || []).find((m) => m.type === 'image')?.url || null,
            processing: s.status === 'media_processing',
        }));

        return res.status(200).type('text/html; charset=utf-8').send(renderList(req.parc, {
            cars,
            processing: cars.filter((c) => c.processing).length,
            flash: flashFrom(req.query),
        }));
    } catch (err) { return next(err); }
});

// ════════════════════════════════════════════════════════════════════════════
//  ADĂUGARE
// ════════════════════════════════════════════════════════════════════════════

const loadBrands = () => brandsModel.find({}).select('id name').sort({ name: 1 }).lean();

dealerAdmin.get('/admin/adauga', async (req, res, next) => {
    try {
        return res.status(200).type('text/html; charset=utf-8')
            .send(renderCarForm(req.parc, { brands: await loadBrands() }));
    } catch (err) { return next(err); }
});

dealerAdmin.post('/admin/adauga', dealerActionLimiter, checkOrigin, wrap(uploadMedia), async (req, res) => {
    const files = req.files || [];
    const uid = req.dealer.user._id;

    try {
        const fields = validateSaleFields(req.body);
        const media = validateSaleFiles(files);
        if (!fields.ok || !media.ok) {
            cleanupTemp(files);
            return res.status(400).json({ success: false, errors: [...fields.errors, ...media.errors] });
        }

        const now = new Date();
        const paidUntil = addMonths(now, 6);

        const sale = new sales({
            ...fields.data,
            user_id: uid,
            user_name: req.dealer.user.username,
            user_image: req.parc.logo_url,
            phone_number: normalizePhone(fields.data.phone_number) || fields.data.phone_number,
            media: [],
            is_active: false,
            status: 'media_processing',
            paid_until: paidUntil,
            expires_at: addDays(paidUntil, 10),
        });
        // Hook-ul pre('save') din salesModel generează slug-ul automat.
        await sale.save();

        await addMediaToQueue(String(sale._id), files, []);

        return res.json({
            success: true,
            redirect: '/admin/masini?ok=' + encodeURIComponent(
                'Anunț publicat. Pozele se optimizează — apare pe site în câteva minute.'),
        });

    } catch (err) {
        cleanupTemp(files);
        console.error('[dealerAdmin] adaugă:', err);
        return res.status(500).json({ success: false, message: 'Eroare la publicare. Încearcă din nou.' });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  EDITARE
// ════════════════════════════════════════════════════════════════════════════

dealerAdmin.get('/admin/masina/:id', async (req, res, next) => {
    const { id } = req.params;
    if (!isId(id)) return res.redirect('/admin/masini');
    try {
        // `user_id` în FILTRU, nu în verificare ulterioară.
        const s = await sales.findOne({ _id: id, user_id: req.dealer.user._id }).lean();
        if (!s) return res.redirect('/admin/masini?err=' + encodeURIComponent('Anunțul nu există.'));

        return res.status(200).type('text/html; charset=utf-8').send(renderCarForm(req.parc, {
            brands: await loadBrands(),
            car: {
                id: String(s._id),
                title: s.title,
                brand_id: s.brand?.id, brand_name: s.brand?.name,
                model_id: s.model?.id, model_name: s.model?.name,
                engine_capacity: s.engine?.capacity, engine_fuel: s.engine?.fuel_type,
                price: s.price, mileage: s.mileage, production_year: s.production_year,
                horsepower: s.horsepower, body_type: s.body_type, color: s.color,
                transmission: s.transmission, drivetrain: s.drivetrain,
                pollution_standard: s.pollution_standard, steering_wheel: s.steering_wheel,
                registration_status: s.registration_status, vin: s.vin,
                negotiable: s.negotiable, exchange_accepted: s.exchange_accepted,
                for_dismante: s.for_dismante, description: s.description,
                city: s.location?.city, county: s.location?.county,
                phone_number: s.phone_number,
            },
            flash: flashFrom(req.query),
        }));
    } catch (err) { return next(err); }
});

dealerAdmin.post('/admin/masina/:id', dealerActionLimiter, checkOrigin, wrap(uploadMedia), async (req, res) => {
    const files = req.files || [];
    const { id } = req.params;

    if (!isId(id)) { cleanupTemp(files); return res.status(400).json({ success: false, message: 'ID invalid.' }); }

    try {
        const sale = await sales.findOne({ _id: id, user_id: req.dealer.user._id });
        if (!sale) {
            cleanupTemp(files);
            return res.status(404).json({ success: false, message: 'Anunțul nu există.' });
        }

        const fields = validateSaleFields(req.body);
        if (!fields.ok) {
            cleanupTemp(files);
            return res.status(400).json({ success: false, errors: fields.errors });
        }

        // Fotografii noi → înlocuiesc COMPLET setul existent. Formularul spune
        // asta explicit, ca dealerul să nu piardă poze din neatenție.
        const replacing = files.length > 0;
        if (replacing) {
            const media = validateSaleFiles(files);
            if (!media.ok) {
                cleanupTemp(files);
                return res.status(400).json({ success: false, errors: media.errors });
            }
        }

        // Marca, modelul și anul NU se schimbă la editare: slug-ul e derivat din
        // ele și e deja indexat de Google și partajat pe Facebook. Restul, da.
        const { brand, model, production_year, ...editable } = fields.data;
        Object.assign(sale, editable);
        sale.phone_number = normalizePhone(fields.data.phone_number) || fields.data.phone_number;
        await sale.save();

        if (replacing) {
            const oldIds = (sale.media || []).map((m) => m.public_id).filter(Boolean);
            await addMediaUpdateToQueue(String(sale._id), files, oldIds, []);
        } else {
            onStockChange(sale.user_id, { slugs: [sale.slug] }).catch(() => {});
        }

        return res.json({
            success: true,
            redirect: '/admin/masini?ok=' + encodeURIComponent(
                replacing ? 'Anunț salvat. Pozele noi se procesează.' : 'Anunț salvat.'),
        });

    } catch (err) {
        cleanupTemp(files);
        console.error('[dealerAdmin] editare:', err);
        return res.status(500).json({ success: false, message: 'Eroare la salvare.' });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  ȘTERGERE
// ────────────────────────────────────────────────────────────────────────────
//  Definitivă: șterge fotografiile din R2, comentariile, seen posts, postările
//  sociale și documentul. Confirmarea din interfață e obligatorie, iar butonul
//  principal din listă e roșu, nu unul pe care îl apeși din reflex.
// ════════════════════════════════════════════════════════════════════════════

dealerAdmin.post('/admin/masina/:id/sterge', dealerActionLimiter, checkOrigin, async (req, res, next) => {
    const { id } = req.params;
    if (!isId(id)) return res.redirect('/admin/masini');

    try {
        const uid = req.dealer.user._id;
        const sale = await sales.findOne({ _id: id, user_id: uid }).select('_id').lean();
        if (!sale) {
            return res.redirect('/admin/masini?err=' + encodeURIComponent('Anunțul nu există.'));
        }

        // Serviciul comun face toți cei cinci pași, în ordinea corectă:
        // cleanup social → R2 → comentarii → seen posts → document.
        // `uid` intră în filtru, deci un anunț al altcuiva nu se găsește.
        await deleteSaleCompletely(id, uid);

        onStockChange(uid, { removed: true }).catch(() => {});
        return res.redirect('/admin/masini?ok=' + encodeURIComponent('Anunț șters definitiv.'));

    } catch (err) { return next(err); }
});

// ════════════════════════════════════════════════════════════════════════════
//  SETĂRI SITE
// ════════════════════════════════════════════════════════════════════════════

dealerAdmin.get('/admin/setari', (req, res) => {
    return res.status(200).type('text/html; charset=utf-8')
        .send(renderSettings(req.parc, { flash: flashFrom(req.query) }));
});

dealerAdmin.post('/admin/setari', dealerActionLimiter, checkOrigin, wrap(uploadBanner), async (req, res, next) => {
    try {
        const parc = await parcuri.findOne({ _id: req.parc._id, user_id: req.dealer.user._id });
        if (!parc) return res.redirect('/admin/setari?err=' + encodeURIComponent('Site inexistent.'));

        const oldSub = parc.subdomain;
        const b = req.body || {};

        // Lista albă de câmpuri. Orice altceva trimis din formular e ignorat —
        // inclusiv `subdomain`, `preset`, `accent_color`, `indexable`.
        for (const k of ['hero_title', 'hero_subtitle', 'about_title', 'about_text', 'contact_intro', 'email']) {
            if (k in b) parc[k] = sanitize(b[k]);
        }
        if (b.phone) parc.phone = b.phone;         // setter-ul normalizează
        if (b.whatsapp) parc.whatsapp = b.whatsapp;

        // ── Serviciile ──────────────────────────────────────────────────────
        // Se editează DOAR dacă parcul are deja exact trei. Dealerul nu poate
        // adăuga sau elimina secțiunea — asta rămâne la CarFlip, ca structura
        // paginii să nu se schimbe sub el.
        //
        // Toate cele trei trebuie completate: un card gol ar lăsa un spațiu
        // vizibil în grilă. Dacă vreunul lipsește, se ignoră tot blocul și
        // serviciile rămân neatinse.
        if (Array.isArray(parc.services) && parc.services.length === 3) {
            const parsed = [];
            for (let i = 0; i < 3; i++) {
                const title = sanitize(b[`svc_title_${i}`]).slice(0, 40);
                const text = sanitize(b[`svc_text_${i}`]).slice(0, 180);
                const icon = sanitize(b[`svc_icon_${i}`]);
                if (!title || !text) { parsed.length = 0; break; }
                parsed.push({
                    icon: isValidIcon(icon) ? icon : (parc.services[i]?.icon || DEFAULT_ICON),
                    title, text,
                });
            }
            if (parsed.length === 3) parc.services = parsed;
            if ('services_title' in b) parc.services_title = sanitize(b.services_title).slice(0, 60);
        }

        let oldBanner = null;
        if (req.file) {
            const up = await uploadParcImage({
                buffer: req.file.buffer, kind: 'banner', parcId: String(parc._id),
            });
            oldBanner = parc.banner_public_id;
            parc.banner_url = up.url;
            parc.banner_public_id = up.public_id;
        }

        await parc.save();
        // Bannerul vechi se șterge DOAR după salvarea reușită. Invers, o eroare
        // de validare ar lăsa site-ul fără imagine.
        if (oldBanner) await deleteParcImage(oldBanner);

        await invalidateParcCache(oldSub, parc.subdomain);
        await warmParcCache(parc);

        return res.redirect('/admin/setari?ok=' + encodeURIComponent('Setări salvate.'));

    } catch (err) {
        if (err?.name === 'ValidationError') {
            const first = Object.values(err.errors)[0]?.message || 'Date invalide.';
            return res.redirect('/admin/setari?err=' + encodeURIComponent(first));
        }
        return next(err);
    }
});

export default dealerAdmin;
