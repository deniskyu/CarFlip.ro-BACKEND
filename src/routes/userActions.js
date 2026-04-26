import { Router } from 'express';
import multer from 'multer';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'; // Am scos Put/Get URL, le face Worker-ul!
import path from 'path';
import fs from 'fs-extra'; // <--- NOU: Pentru folderul temporar
import mongoose from 'mongoose';
import sales from '../models/salesModel.js'; 
import users from '../models/userModel.js';
import Comments from '../models/commentModel.js';
import { authUser, fetchLimiter } from './usersRoute.js'; 
import SeenPost from '../models/seenPostsModel.js';
import discountCodes from '../models/discountCodes.js';
import { addMonths, addDays } from 'date-fns';
import admin from '../firebase/firebase.js';
import { triggerSearchAlerts } from './searchAlertsRoute.js';
import { addMediaToQueue } from '../mediaProcessing/mediaQueue.js'; // <--- NOU: Legătura cu Coada
import { sendAndSaveNotification } from '../services/notificationService.js';
import { addMediaUpdateToQueue } from '../mediaProcessing/mediaQueue.js';
//import Stripe from 'stripe';
//const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const userActions = Router();

// ==========================================
// 1. CONFIGURARE CLOUDFLARE R2 (Doar pentru Ștergere)
// ==========================================
const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

// ==========================================
// 2. CONFIGURARE MULTER (Direct pe SSD)
// ==========================================
const rawDirPath = path.join(process.cwd(), 'temp_uploads', 'raw');
fs.ensureDirSync(rawDirPath); // Serverul creează automat folderul dacă nu există

const diskStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, rawDirPath);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase() || '.bin';
        const uniqueName = `raw_${Date.now()}_${Math.round(Math.random() * 1E9)}${ext}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: diskStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // Siguranță hardware: Max 50MB per fișier
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Format neacceptat! Doar foto/video.'), false);
        }
    }
});

// Helper de curățare text
const sanitize = (text) => {
    if (!text) return "";
    return String(text).trim();
};


userActions.post('/api/sale/post/free',
    authUser,
    fetchLimiter,
    upload.array('mediaFiles', 10),
    async (req, res) => {
        try {
            let {
                brand_id, brand_name, model_id, model_name, engine_capacity, engine_fuel,
                price, mileage, production_year, body_type, color, transmission,
                drivetrain, pollution_standard, county, city,
                registration_status, exchange_accepted, for_dismante,
                phone_number, description,
                vin, steering_wheel, negotiable, allow_comments,
                media_metadata, title
            } = req.body;

            // ── Parsare metadata zoom ─────────────────────────────────
            let parsedMetadata = [];
            try {
                if (media_metadata) {
                    parsedMetadata = JSON.parse(media_metadata);
                }
            } catch (e) {
                console.warn("⚠️ Eroare la parsarea media_metadata, vom folosi zoom default.", e.message);
                parsedMetadata = [];
            }

            // ── Validare câmpuri obligatorii (identică cu ruta plătită) ──
            if (
                !brand_id || !brand_name || !model_id || !model_name ||
                !engine_capacity || !engine_fuel || !price ||
                !mileage || !production_year || !body_type || !color ||
                !transmission || !drivetrain || !pollution_standard ||
                !county || !city || !registration_status || !phone_number || !description || !title
            ) {
                return res.status(400).json({ success: false, message: "Te rugăm să completezi toate câmpurile esențiale." });
            }

            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ success: false, message: "Este necesar cel puțin un fișier media (poză/video)." });
            }

            // ── Validare fișiere (identică cu ruta plătită) ──────────
            let videoCount = 0;
            const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
            const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

            for (const file of req.files) {
                const isVideo = file.mimetype.startsWith('video/');
                const isImage = file.mimetype.startsWith('image/');

                if (isVideo) {
                    videoCount++;
                    if (videoCount > 1) {
                        return res.status(400).json({ success: false, message: "Maxim 1 videoclip permis." });
                    }
                    if (file.size > MAX_VIDEO_SIZE) {
                        return res.status(400).json({ success: false, message: "Un fișier video depășește limita de 50MB." });
                    }
                } else if (isImage) {
                    if (file.size > MAX_IMAGE_SIZE) {
                        return res.status(400).json({ success: false, message: "O imagine depășește limita de 15MB." });
                    }
                }
            }

            // ── Verificare user ──────────────────────────────────────
            const currentUser = await users.findById(req.user.id);
            if (!currentUser) return res.status(404).json({ success: false, message: "Utilizator invalid." });

            // ── Date plată: gratuit, 3 luni, media_processing ────────
            const now = new Date();
            const paidUntil = addMonths(now, 3);
            const expiresAt = addDays(paidUntil, 10);

            // ── Creare anunț (identic, fără Stripe) ──────────────────
            const newSale = new sales({
                user_id: req.user.id,
                user_name: currentUser.username,
                user_image: currentUser.icon,
                title: sanitize(title),
                brand: { id: Number(brand_id), name: sanitize(brand_name) },
                model: { id: Number(model_id), name: sanitize(model_name) },
                engine: { capacity: sanitize(engine_capacity), fuel_type: sanitize(engine_fuel) },
                price: Number(String(price).replace(/[^0-9]/g, '')),
                negotiable: String(negotiable) === 'true',
                vin: vin ? sanitize(vin).toUpperCase() : "",
                steering_wheel: steering_wheel === 'right' ? 'right' : 'left',
                mileage: Number(String(mileage).replace(/[^0-9]/g, '')),
                production_year: Number(production_year),
                body_type: sanitize(body_type),
                color: sanitize(color),
                transmission: sanitize(transmission),
                drivetrain: sanitize(drivetrain),
                pollution_standard: sanitize(pollution_standard),
                location: { county: sanitize(county), city: sanitize(city) },
                registration_status: sanitize(registration_status),
                exchange_accepted: String(exchange_accepted) === 'true' || String(exchange_accepted) === 'yes',
                for_dismante: String(for_dismante) === 'true' || String(for_dismante) === 'yes',
                phone_number: sanitize(phone_number),
                description: sanitize(description),
                media: [],
                likes_count: 0,
                views: 0,
                comments_count: 0,
                allow_comments: allow_comments !== undefined ? String(allow_comments) === 'true' : true,
                // Gratuit: media_processing → worker-ul îl face active când termină
                is_active: false,
                status: 'media_processing',
                paid_until: paidUntil,
                expires_at: expiresAt,
                stripe_subscription_id: null
            });

            await newSale.save();

            // ── Punem media în coada BullMQ (identic) ────────────────
            await addMediaToQueue(newSale._id, req.files, parsedMetadata);

            return res.json({
                success: true,
                message: "Anunț în procesare! Va fi publicat automat când elementele media sunt gata. (câteva minute)",
                saleId: newSale._id,
                requiresPayment: false
            });

        } catch (error) {
            console.error("Eroare la postare gratuită:", error);
            return res.status(500).json({ success: false, message: "Eroare internă la crearea anunțului." });
        }
    }
);

// 🚀 RUTA MONSTRU: POSTAREA ANUNȚULUI
/*userActions.post('/api/sale/post',
    authUser,
    fetchLimiter,
    upload.array('mediaFiles', 10),
    async (req, res) => {
        try {
            let {
                brand_id, brand_name, model_id, model_name, engine_capacity, engine_fuel,
                price, mileage, production_year, body_type, color, transmission,
                drivetrain, pollution_standard, county, city,
                registration_status, exchange_accepted, for_dismante,
                phone_number, description, discount_code,
                vin, steering_wheel, negotiable, allow_comments,
                media_metadata
            } = req.body;

            let parsedMetadata = [];
            try {
                if (media_metadata) {
                    parsedMetadata = JSON.parse(media_metadata);
                }
            } catch (e) {
                console.warn("⚠️ Eroare la parsarea media_metadata, vom folosi zoom default.", e.message);
                parsedMetadata = [];
            }

            if(
                !brand_id || !brand_name || !model_id || !model_name || 
                !engine_capacity || !engine_fuel || !price || 
                !mileage || !production_year || !body_type || !color || 
                !transmission || !drivetrain || !pollution_standard || 
                !county || !city || !registration_status || !phone_number || !description
            ) {
                return res.status(400).json({ success: false, message: "Te rugăm să completezi toate câmpurile esențiale." });
            }

            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ success: false, message: "Este necesar cel puțin un fișier media (poză/video)." });
            }

            let videoCount = 0;
            const MAX_IMAGE_SIZE = 15 * 1024 * 1024; 
            const MAX_VIDEO_SIZE = 50 * 1024 * 1024; 

            for (const file of req.files) {
                const isVideo = file.mimetype.startsWith('video/');
                const isImage = file.mimetype.startsWith('image/');

                if (isVideo) {
                    videoCount++;
                    if (videoCount > 2) {
                        return res.status(400).json({ success: false, message: "Maxim 2 videoclipuri permise." });
                    }
                    if (file.size > MAX_VIDEO_SIZE) {
                        return res.status(400).json({ success: false, message: "Un fișier video depășește limita de 50MB." });
                    }
                } else if (isImage) {
                    if (file.size > MAX_IMAGE_SIZE) {
                        return res.status(400).json({ success: false, message: "O imagine depășește limita de 15MB." });
                    }
                }
            }

            const currentUser = await users.findById(req.user.id);
            if (!currentUser) return res.status(404).json({ success: false, message: "Utilizator invalid." });

            let isActive = true;
            let saleStatus = 'pending_payment';
            let paidUntil = addMonths(now, 3); 
            let expiresAt = addDays(paidUntil, 10);
            let requiresPayment = true;
            let discountApplied = 0;
            let validCode = null; // Salvăm referința codului

            // 🔥 FIX 1: Doar citim codul de reducere, NU îl incrementăm încă!
            if (discount_code) {
                validCode = await discountCodes.findOne({ 
                    code: discount_code.toUpperCase(), 
                    is_active: true 
                });
                
                if (!validCode) return res.status(400).json({ success: false, message: "Cod de reducere invalid sau expirat." });

                discountApplied = validCode.percentage_off;
                if (discountApplied === 100) {
                    const now = new Date();
                    isActive = false; 
                    saleStatus = 'media_processing'; 
                    paidUntil = addMonths(now, 2); 
                    expiresAt = addDays(paidUntil, 10);
                    requiresPayment = false;
                }
            }

            const newSale = new sales({
                user_id: req.user.id,
                user_name: currentUser.username,
                user_image: currentUser.icon,
                brand: { id: Number(brand_id), name: sanitize(brand_name) },
                model: { id: Number(model_id), name: sanitize(model_name) },
                engine: { capacity: sanitize(engine_capacity), fuel_type: sanitize(engine_fuel) },
                price: Number(String(price).replace(/[^0-9]/g, '')),
                negotiable: String(negotiable) === 'true',
                vin: vin ? sanitize(vin).toUpperCase() : "", 
                steering_wheel: steering_wheel === 'right' ? 'right' : 'left',
                mileage: Number(String(mileage).replace(/[^0-9]/g, '')),
                production_year: Number(production_year),
                body_type: sanitize(body_type), color: sanitize(color), transmission: sanitize(transmission),
                drivetrain: sanitize(drivetrain), pollution_standard: sanitize(pollution_standard),
                location: { county: sanitize(county), city: sanitize(city) },
                registration_status: sanitize(registration_status),
                exchange_accepted: String(exchange_accepted) === 'true' || String(exchange_accepted) === 'yes',
                for_dismante: String(for_dismante) === 'true' || String(for_dismante) === 'yes',
                phone_number: sanitize(phone_number), description: sanitize(description),
                media: [], 
                likes_count: 0, views: 0, comments_count: 0,
                allow_comments: allow_comments !== undefined ? String(allow_comments) === 'true' : true,
                is_active: isActive, status: saleStatus, paid_until: paidUntil, expires_at: expiresAt
            });

            await newSale.save();
            let clientSecret = null;

            if (requiresPayment) {
                const customers = await stripe.customers.list({ email: currentUser.email, limit: 1 });
                let customerId = customers.data.length > 0
                    ? customers.data[0].id
                    : (await stripe.customers.create({ email: currentUser.email, metadata: { userId: currentUser._id.toString() } })).id;

                let subscriptionParams = {
                    customer: customerId,
                    items: [{ price: process.env.STRIPE_PRICE_ID }],
                    payment_behavior: 'default_incomplete',
                    payment_settings: { payment_method_types: ['card'], save_default_payment_method: 'on_subscription' },
                    expand: ['latest_invoice.payment_intent', 'latest_invoice.confirmation_secret', 'pending_setup_intent'], 
                    metadata: { saleId: newSale._id.toString() }
                };
    
                if (discountApplied > 0 && discountApplied < 100 && discount_code) {
                    subscriptionParams.discounts = [{ coupon: discount_code.toUpperCase() }];
                }
    
                const subscription = await stripe.subscriptions.create(subscriptionParams);
                
                let invoice = subscription.latest_invoice;
                let pi = invoice?.payment_intent;
                let si = subscription.pending_setup_intent;
    
                if (typeof pi === 'string') pi = await stripe.paymentIntents.retrieve(pi);
                if (typeof si === 'string') si = await stripe.setupIntents.retrieve(si);
    
                clientSecret = pi?.client_secret || si?.client_secret || invoice?.confirmation_secret?.client_secret || invoice?.confirmation_secret;
    
                if (clientSecret) {
                    console.log('✅ Cheie Stripe generată cu succes!');
                } else if (subscription.status === 'active') {
                    requiresPayment = false;
                    newSale.status = 'media_processing'; 
                    await newSale.save();
                } else {
                    throw new Error("Stripe API a eșuat generarea cheii.");
                }

                newSale.stripe_subscription_id = subscription.id;
                await newSale.save();
            }

            await addMediaToQueue(newSale._id, req.files, parsedMetadata);

            if (validCode) {
                await discountCodes.findByIdAndUpdate(validCode._id, { $inc: { current_uses: 1 } });
            }

            return res.json({
                success: true,
                message: requiresPayment ? "Draft salvat. Urmează plata, elementele media se procesează în fundal." : "Anunț în procesare! Va fi publicat automat când elementele media sunt gata. (câteva minute)",
                saleId: newSale._id, requiresPayment, discountPercentage: discountApplied, clientSecret
            });

        } catch (error) {
            console.error("Eroare la postare:", error);
            return res.status(500).json({ success: false, message: "Eroare internă la crearea anunțului." });
        }
    }
);
*/


/*userActions.post('/api/discount/validate/:code', authUser, fetchLimiter, async (req, res) => {
    try {
        const { code } = req.params;

        if (!code) {
            return res.status(400).json({ success: false, message: "Te rugăm să introduci un cod." });
        }

        const validCode = await discountCodes.findOne({ 
            code: code.toUpperCase(), 
            is_active: true 
        });

        if (!validCode) {
            return res.status(404).json({ success: false, message: "Cod invalid sau expirat." });
        }

        return res.json({ 
            success: true, 
            percentage_off: validCode.percentage_off,
            message: "Cod aplicat cu succes!"
        });

    } catch (error) {
        console.error("Eroare la validarea codului:", error);
        return res.status(500).json({ success: false, message: "Eroare la validarea codului." });
    }
});*/

userActions.get('/api/sales/feed', authUser, fetchLimiter, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const cursor = req.query.cursor; 
        const mode = req.query.mode || 'new'; 

        const userId = req.user.id;
        if (!userId)
            return res.json({ success: false, message: "Sesiune expirata" });

        const userObjectId = new mongoose.Types.ObjectId(userId);

        const currentUserData = await users.findById(userId).select('blocking blocked_by');

        const excludedUserIds = [
            ...(currentUserData.blocking || []),
            ...(currentUserData.blocked_by || [])
        ].map(id => new mongoose.Types.ObjectId(id));

        // ── CONSTRUIM AGGREGATION PIPELINE ────────────────────────────────

        const pipeline = [];

        // STEP 1: Match de bază — active + exclude blocked users
        const baseMatch = { is_active: true };

        if (excludedUserIds.length > 0) {
            baseMatch.user_id = { $nin: excludedUserIds };
        }

        // Cursor pagination (exact ca înainte)
        if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
            baseMatch._id = { $lt: new mongoose.Types.ObjectId(cursor) };
        }

        pipeline.push({ $match: baseMatch });

        // STEP 2: Sortare descrescătoare (cele mai noi primele)
        pipeline.push({ $sort: { _id: -1 } });

        // STEP 3: $lookup pe SeenPost — verifică dacă userul a văzut fiecare post
        // În loc să încărcăm 1500 IDs și să facem $nin, MongoDB verifică
        // fiecare post individual contra indexului { user_id: 1, sale_id: 1 } → O(1)
        pipeline.push({
            $lookup: {
                from: 'seenposts',
                let: { saleId: '$_id' },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ['$sale_id', '$$saleId'] },
                                    { $eq: ['$user_id', userObjectId] }
                                ]
                            }
                        }
                    },
                    { $limit: 1 } // Ne trebuie doar existența, nu tot documentul
                ],
                as: 'seenCheck'
            }
        });

        // STEP 4: Filtru seen/unseen (echivalent cu $nin/$in de dinainte)
        if (mode === 'new') {
            // Nevăzute: seenCheck e gol (nu există în seenposts)
            pipeline.push({ $match: { seenCheck: { $size: 0 } } });
        } else {
            // History (văzute): seenCheck are cel puțin un element
            pipeline.push({ $match: { 'seenCheck.0': { $exists: true } } });
        }

        // STEP 5: Limit
        pipeline.push({ $limit: limit });

        // STEP 6: Calculăm hasLiked direct în pipeline
        // NU mai trimitem array-ul liked_by de 500 obiecte la client
        pipeline.push({
            $addFields: {
                hasLiked: {
                    $cond: {
                        if: { $isArray: '$liked_by' },
                        then: {
                            $anyElementTrue: {
                                $map: {
                                    input: '$liked_by',
                                    as: 'like',
                                    in: { $eq: ['$$like.user_id', userObjectId] }
                                }
                            }
                        },
                        else: false
                    }
                }
            }
        });

        // STEP 7: Scoatem liked_by și seenCheck din răspuns
        pipeline.push({
            $project: {
                liked_by: 0,
                seenCheck: 0
            }
        });

        // STEP 8: Populate user_id cu username + email (echivalent cu .populate())
        pipeline.push({
            $lookup: {
                from: 'users',
                localField: 'user_id',
                foreignField: '_id',
                pipeline: [
                    { $project: { username: 1, email: 1 } }
                ],
                as: '_user_populated'
            }
        });

        pipeline.push({
            $addFields: {
                user_id: { $arrayElemAt: ['$_user_populated', 0] }
            }
        });

        pipeline.push({ $project: { _user_populated: 0 } });

        pipeline.push({ $match: { user_id: { $ne: null } } });

        // ── EXECUTĂM ──────────────────────────────────────────────────────

        const foundSales = await sales.aggregate(pipeline);

        // Cursor pentru paginare (exact ca înainte)
        let nextCursor = null;
        if (foundSales.length > 0) {
            nextCursor = foundSales[foundSales.length - 1]._id;
        }

        // Detectare sfârșit posturi noi (exact ca înainte)
        if (mode === 'new' && foundSales.length === 0) {
            return res.json({
                success: true,
                data: [],
                nextCursor: null,
                endOfNewPosts: true
            });
        }

        return res.json({ 
            success: true, 
            data: foundSales,
            nextCursor,
            endOfNewPosts: false
        });

    } catch (error) {
        console.error("Feed Error:", error);
        return res.status(500).json({ success: false, message: "Eroare la încărcarea feed-ului." });
    }
});

// --- RUTA FEED VECHE ---
/*userActions.get('/api/sales/feed', authUser, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const cursor = req.query.cursor; 
        const mode = req.query.mode || 'new'; 

        const userId = req.user.id;
        if(!userId)
            return res.json({success: false, message: "Sesiune expirata"})

        const currentUserData = await users.findById(req.user.id).select('blocking blocked_by');

        const excludedUserIds = [
            ...(currentUserData.blocking || []),
            ...(currentUserData.blocked_by || [])
        ];

        const seenDocs = await SeenPost.find({ user_id: req.user.id }).select('sale_id');
        const seenIds = seenDocs.map(doc => doc.sale_id);

        let query = { is_active: true, user_id: { $nin: excludedUserIds } };

        if (mode === 'new') {
            query._id = { $nin: seenIds };
        } else {
            query._id = { $in: seenIds };
        }

        // --- FIX PAGINARE: Conversie String -> ObjectId ---
        if (cursor) {
            // Verificăm dacă cursorul este un ObjectId valid
            if (mongoose.Types.ObjectId.isValid(cursor)) {
                const cursorId = new mongoose.Types.ObjectId(cursor);
                
                // Îmbinăm cu query-ul existent de _id ($in sau $nin)
                if (query._id) {
                    query._id = { ...query._id, $lt: cursorId };
                } else {
                    query._id = { $lt: cursorId };
                }
            }
        }
        // --------------------------------------------------

        const foundSales = await sales.find(query)
            .sort({ _id: -1 }) // Sortare descrescătoare (cele mai noi primele)
            .limit(limit)
            .populate('user_id', 'username email');

        let nextCursor = null;
        if (foundSales.length > 0) {
            nextCursor = foundSales[foundSales.length - 1]._id;
        }

        if (mode === 'new' && !cursor && foundSales.length === 0) {
            return res.json({
                success: true,
                data: [],
                nextCursor: null,
                endOfNewPosts: true
            });
        }

        const salesWithLike = foundSales.map(doc => {
            const saleObj = doc.toObject ? doc.toObject() : doc;
            const likedByStrings = saleObj.liked_by ? saleObj.liked_by.map(like => like.user_id ? like.user_id.toString() : '') : [];
            
            return {
                ...saleObj,
                hasLiked: likedByStrings.includes(userId)
            };
        });

        return res.json({ 
            success: true, 
            data: salesWithLike,
            nextCursor,
            endOfNewPosts: false
        });

    } catch (error) {
        console.error("Feed Error:", error);
        return res.status(500).json({ success: false, message: "Eroare la încărcarea feed-ului." });
    }
});*/



userActions.post('/api/sales/mark-seen', authUser, fetchLimiter, async (req, res) => {
    try {
        const { sales_ids } = req.body; 

        if (!sales_ids || !Array.isArray(sales_ids) || sales_ids.length === 0) {
            return res.status(400).json({ success: false, message: "Lista de ID-uri lipsește." });
        }

        const userId = new mongoose.Types.ObjectId(req.user.id);
        
        // Transformăm toate ID-urile primite în ObjectId din start ca să le refolosim
        const objectIds = sales_ids.map(id => new mongoose.Types.ObjectId(id));

        // 1. Construim "pachetul" pentru SeenPosts
        const operations = objectIds.map(saleId => {
            return {
                updateOne: {
                    filter: { user_id: userId, sale_id: saleId },
                    update: { 
                        $setOnInsert: { 
                            user_id: userId, 
                            sale_id: saleId 
                        } 
                    },
                    upsert: true
                }
            };
        });

        // 2. Executăm ambele operațiuni (Băgăm la văzute + Incrementăm Views)
        if (operations.length > 0) {
            // Pasul A: Marchează-le ca văzute pentru acest user
            await SeenPost.bulkWrite(operations, { ordered: false });

            // Pasul B: Incrementează cu 1 câmpul "views" pentru toate aceste mașini
            await sales.updateMany(
                { _id: { $in: objectIds } }, 
                { $inc: { views: 1 } }
            );
        }

        return res.json({ success: true, message: "Sync & Views complete." });

    } catch (error) {
        console.error("Eroare la mark-seen:", error);
        return res.status(500).json({ success: false });
    }
});


userActions.get('/api/sales/search', authUser, fetchLimiter, async (req, res) => {
    try {
        const {
            brand_id, model_id,
            min_price, max_price,
            min_year, max_year,
            min_km, max_km,
            fuel_type, body_type, transmission, 
            pollution_standard, registration_status,
            county, city, for_dismante,
            exclude_seen,
            steering_wheel, negotiable,
            page = 1, limit = 10,
        } = req.query;

        // ── HELPER-E (neschimbate) ────────────────────────────────────

        const safeNum = (val) => {
            if (val === undefined || val === null || val === '') return null;
            if (Array.isArray(val)) return null; 
            const cleanVal = String(val).trim(); 
            const num = Number(cleanVal);
            return isNaN(num) ? null : num;
        };

        const safeRegex = (val) => {
            if (!val || val === 'null' || val === 'undefined') return null;
            const cleaned = String(val).trim();
            const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(escaped, 'i');
        };
        // ── BLOCKED USERS (neschimbat) ────────────────────────────────

        const currentUserData = await users.findById(req.user.id).select('blocking blocked_by');

        const excludedUserIds = [
            ...(currentUserData.blocking || []),
            ...(currentUserData.blocked_by || [])
        ];

        // ── CONSTRUIM QUERY-UL DE FILTRE (100% neschimbat) ────────────

        let query = { 
            is_active: true,
            user_id: { $nin: excludedUserIds }
        };

        const sBrand = safeNum(brand_id);
        const sModel = safeNum(model_id);
        if (sBrand !== null) query['brand.id'] = sBrand;
        if (sModel !== null) query['model.id'] = sModel;
        
        if (fuel_type) query['engine.fuel_type'] = String(fuel_type).trim();
        if (body_type) query.body_type = String(body_type).trim();
        if (transmission) query.transmission = String(transmission).trim();
        if (pollution_standard) query.pollution_standard = String(pollution_standard).trim();
        if (registration_status) query.registration_status = registration_status.trim();
        if (county) query['location.county'] = safeRegex(county);
        if (city) query['location.city'] = safeRegex(city);

        if (for_dismante !== undefined) {
            query.for_dismante = (for_dismante === 'true' || for_dismante === true);
        }

        if (steering_wheel) {
            query.steering_wheel = steering_wheel;
        }

        if (negotiable !== undefined) {
            query.negotiable = (negotiable === 'true' || negotiable === true);
        }

        const minP = safeNum(min_price);
        const maxP = safeNum(max_price);
        if (minP !== null || maxP !== null) {
            if (!query.price) query.price = {};
            if (minP !== null) query.price.$gte = minP;
            if (maxP !== null) query.price.$lte = maxP;
        }

        const minY = safeNum(min_year);
        const maxY = safeNum(max_year);
        if (minY !== null || maxY !== null) {
            if (!query.production_year) query.production_year = {};
            if (minY !== null) query.production_year.$gte = minY;
            if (maxY !== null) query.production_year.$lte = maxY;
        }

        const minK = safeNum(min_km);
        const maxK = safeNum(max_km);
        if (minK !== null || maxK !== null) {
            if (!query.mileage) query.mileage = {};
            if (minK !== null) query.mileage.$gte = minK;
            if (maxK !== null) query.mileage.$lte = maxK;
        }

        const safePage = Math.max(1, safeNum(page) || 1);
        const safeLimit = Math.max(1, safeNum(limit) || 10);
        const skip = (safePage - 1) * safeLimit;

        // ══════════════════════════════════════════════════════════════
        // AICI ÎNCEPE PARTEA NOUĂ — AGGREGATION PIPELINE
        // (Blocul vechi cu SeenPost.find() + $nin a fost înlocuit)
        // ══════════════════════════════════════════════════════════════

        const userObjectId = new mongoose.Types.ObjectId(req.user.id);
        const pipeline = [];

        // STEP 1: Match cu toate filtrele (exact aceleași filtre ca înainte)
        pipeline.push({ $match: query });

        // STEP 2: Sortare (neschimbată)
        pipeline.push({ $sort: { likes_count: -1, _id: -1 } });

        // STEP 3: Dacă exclude_seen e activ, filtrăm cu $lookup în loc de $nin
        if (exclude_seen === 'true') {
            pipeline.push({
                $lookup: {
                    from: 'seenposts',
                    let: { saleId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$sale_id', '$$saleId'] },
                                        { $eq: ['$user_id', userObjectId] }
                                    ]
                                }
                            }
                        },
                        { $limit: 1 }
                    ],
                    as: 'seenCheck'
                }
            });

            // Păstrăm doar posturile NEVĂZUTE
            pipeline.push({ $match: { seenCheck: { $size: 0 } } });
        }

        // STEP 4: Paginare (neschimbată)
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: safeLimit });

        // STEP 5: Calculăm hasLiked direct în pipeline
        pipeline.push({
            $addFields: {
                hasLiked: {
                    $cond: {
                        if: { $isArray: '$liked_by' },
                        then: {
                            $anyElementTrue: {
                                $map: {
                                    input: '$liked_by',
                                    as: 'like',
                                    in: { $eq: ['$$like.user_id', userObjectId] }
                                }
                            }
                        },
                        else: false
                    }
                }
            }
        });

        // STEP 6: Scoatem liked_by și seenCheck din răspuns
        const projectOut = { liked_by: 0 };
        if (exclude_seen === 'true') {
            projectOut.seenCheck = 0;
        }
        pipeline.push({ $project: projectOut });

        // STEP 7: Populate user_id cu username + email
        pipeline.push({
            $lookup: {
                from: 'users',
                localField: 'user_id',
                foreignField: '_id',
                pipeline: [
                    { $project: { username: 1, email: 1 } }
                ],
                as: '_user_populated'
            }
        });

        pipeline.push({
            $addFields: {
                user_id: { $arrayElemAt: ['$_user_populated', 0] }
            }
        });

        pipeline.push({ $project: { _user_populated: 0 } });

        pipeline.push({ $match: { user_id: { $ne: null } } });

        // ── EXECUTĂM ──────────────────────────────────────────────────

        const results = await sales.aggregate(pipeline);

        // Răspuns (structură identică cu înainte)
        return res.json({
            success: true,
            data: results,
            page: safePage,
            count: results.length
        });

    } catch (error) {
        console.error("Search Error:", error);
        return res.status(500).json({ success: false, message: "Eroare căutare." });
    }
});

userActions.post('/api/sales/search-unseen', authUser, fetchLimiter, async (req, res) => {
    try {
        const {
            brand_id, model_id,
            min_price, max_price,
            min_year, max_year,
            min_km, max_km,
            fuel_type, body_type, transmission,
            pollution_standard, registration_status,
            county, city, for_dismante,
            steering_wheel, negotiable,
            exclude_ids = [],
            limit = 5,
        } = req.body;

        const safeNum = (val) => {
            if (val === undefined || val === null || val === '') return null;
            if (Array.isArray(val)) return null;
            const cleanVal = String(val).trim();
            const num = Number(cleanVal);
            return isNaN(num) ? null : num;
        };

        const safeRegex = (val) => {
            if (!val || val === 'null' || val === 'undefined') return null;
            const cleaned = String(val).trim();
            const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(escaped, 'i');
        };

        const currentUserData = await users.findById(req.user.id).select('blocking blocked_by');

        const excludedUserIds = [
            ...(currentUserData.blocking || []),
            ...(currentUserData.blocked_by || [])
        ];

        let query = {
            is_active: true,
            user_id: { $nin: excludedUserIds }
        };

        const sBrand = safeNum(brand_id);
        const sModel = safeNum(model_id);
        if (sBrand !== null) query['brand.id'] = sBrand;
        if (sModel !== null) query['model.id'] = sModel;

        if (fuel_type) query['engine.fuel_type'] = String(fuel_type).trim();
        if (body_type) query.body_type = String(body_type).trim();
        if (transmission) query.transmission = String(transmission).trim();
        if (pollution_standard) query.pollution_standard = String(pollution_standard).trim();
        if (registration_status) query.registration_status = String(registration_status).trim();
        if (county) query['location.county'] = safeRegex(county);
        if (city) query['location.city'] = safeRegex(city);

        if (for_dismante !== undefined) {
            query.for_dismante = (for_dismante === 'true' || for_dismante === true);
        }

        if (steering_wheel) {
            query.steering_wheel = steering_wheel;
        }

        if (negotiable !== undefined) {
            query.negotiable = (negotiable === 'true' || negotiable === true);
        }

        const minP = safeNum(min_price);
        const maxP = safeNum(max_price);
        if (minP !== null || maxP !== null) {
            if (!query.price) query.price = {};
            if (minP !== null) query.price.$gte = minP;
            if (maxP !== null) query.price.$lte = maxP;
        }

        const minY = safeNum(min_year);
        const maxY = safeNum(max_year);
        if (minY !== null || maxY !== null) {
            if (!query.production_year) query.production_year = {};
            if (minY !== null) query.production_year.$gte = minY;
            if (maxY !== null) query.production_year.$lte = maxY;
        }

        const minK = safeNum(min_km);
        const maxK = safeNum(max_km);
        if (minK !== null || maxK !== null) {
            if (!query.mileage) query.mileage = {};
            if (minK !== null) query.mileage.$gte = minK;
            if (maxK !== null) query.mileage.$lte = maxK;
        }

        const excludeObjectIds = (Array.isArray(exclude_ids) ? exclude_ids : [])
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

        if (excludeObjectIds.length > 0) {
            query._id = { ...(query._id || {}), $nin: excludeObjectIds };
        }

        const safeLimit = Math.max(1, safeNum(limit) || 5);
        const userObjectId = new mongoose.Types.ObjectId(req.user.id);
        const pipeline = [];

        pipeline.push({ $match: query });

        pipeline.push({ $sort: { likes_count: -1, _id: -1 } });

        pipeline.push({
            $lookup: {
                from: 'seenposts',
                let: { saleId: '$_id' },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ['$sale_id', '$$saleId'] },
                                    { $eq: ['$user_id', userObjectId] }
                                ]
                            }
                        }
                    },
                    { $limit: 1 }
                ],
                as: 'seenCheck'
            }
        });

        pipeline.push({ $match: { seenCheck: { $size: 0 } } });

        pipeline.push({ $limit: safeLimit });

        pipeline.push({
            $addFields: {
                hasLiked: {
                    $cond: {
                        if: { $isArray: '$liked_by' },
                        then: {
                            $anyElementTrue: {
                                $map: {
                                    input: '$liked_by',
                                    as: 'like',
                                    in: { $eq: ['$$like.user_id', userObjectId] }
                                }
                            }
                        },
                        else: false
                    }
                }
            }
        });

        pipeline.push({ $project: { liked_by: 0, seenCheck: 0 } });

        pipeline.push({
            $lookup: {
                from: 'users',
                localField: 'user_id',
                foreignField: '_id',
                pipeline: [
                    { $project: { username: 1, email: 1 } }
                ],
                as: '_user_populated'
            }
        });

        pipeline.push({
            $addFields: {
                user_id: { $arrayElemAt: ['$_user_populated', 0] }
            }
        });

        pipeline.push({ $project: { _user_populated: 0 } });

        pipeline.push({ $match: { user_id: { $ne: null } } });

        const results = await sales.aggregate(pipeline);

        return res.json({
            success: true,
            data: results,
            count: results.length
        });

    } catch (error) {
        console.error("Search Unseen Error:", error);
        return res.status(500).json({ success: false, message: "Eroare căutare." });
    }
});

/*userActions.get('/api/sales/search', authUser, async (req, res) => {
    try {
        const {
            brand_id, model_id,
            min_price, max_price,
            min_year, max_year,
            min_km, max_km,
            fuel_type, body_type, transmission, 
            pollution_standard, registration_status,
            county, city, for_dismante,
            exclude_seen,
            steering_wheel, negotiable,
            page = 1, limit = 10,
        } = req.query;

        const safeNum = (val) => {
            if (val === undefined || val === null || val === '') return null;
            if (Array.isArray(val)) return null; 
            const cleanVal = String(val).trim(); 
            const num = Number(cleanVal);
            return isNaN(num) ? null : num;
        };

        const safeRegex = (val) => {
            if (!val || val === 'null' || val === 'undefined') return null;
            const cleaned = String(val).trim();
            return new RegExp(cleaned, 'i'); 
        };

        const currentUserData = await users.findById(req.user.id).select('blocking blocked_by');

        const excludedUserIds = [
            ...(currentUserData.blocking || []),
            ...(currentUserData.blocked_by || [])
        ];

        let query = { is_active: true,
            user_id: { $nin: excludedUserIds }
         };

        const sBrand = safeNum(brand_id);
        const sModel = safeNum(model_id);
        if (sBrand !== null) query['brand.id'] = sBrand;
        if (sModel !== null) query['model.id'] = sModel;
        
        if (fuel_type) query['engine.fuel_type'] = safeRegex(fuel_type);
        if (body_type) query.body_type = safeRegex(body_type);
        if (transmission) query.transmission = safeRegex(transmission);
        if (pollution_standard) query.pollution_standard = safeRegex(pollution_standard); 
        if (registration_status) query.registration_status = registration_status.trim();
        if (county) query['location.county'] = safeRegex(county);
        if (city) query['location.city'] = safeRegex(city);

        if (for_dismante !== undefined) {
            query.for_dismante = (for_dismante === 'true' || for_dismante === true);
        }

        if (steering_wheel) {
            query.steering_wheel = steering_wheel;
        }

        if (negotiable !== undefined) {
            query.negotiable = (negotiable === 'true' || negotiable === true);
        }
        // -------------------------------------

        const minP = safeNum(min_price);
        const maxP = safeNum(max_price);
        if (minP !== null || maxP !== null) {
            if (!query.price) query.price = {};
            if (minP !== null) query.price.$gte = minP;
            if (maxP !== null) query.price.$lte = maxP;
        }

        const minY = safeNum(min_year);
        const maxY = safeNum(max_year);
        if (minY !== null || maxY !== null) {
            if (!query.production_year) query.production_year = {};
            if (minY !== null) query.production_year.$gte = minY;
            if (maxY !== null) query.production_year.$lte = maxY;
        }

        const minK = safeNum(min_km);
        const maxK = safeNum(max_km);
        if (minK !== null || maxK !== null) {
            if (!query.mileage) query.mileage = {};
            if (minK !== null) query.mileage.$gte = minK;
            if (maxK !== null) query.mileage.$lte = maxK;
        }

        const safePage = Math.max(1, safeNum(page) || 1);
        const safeLimit = Math.max(1, safeNum(limit) || 10);
        const skip = (safePage - 1) * safeLimit;

        if (exclude_seen === 'true') {
            // Găsim ID-urile anunțurilor văzute de acest user
            const seenDocs = await SeenPost.find({ user_id: req.user.id }).select('sale_id');
            const seenIds = seenDocs.map(doc => doc.sale_id);

            if (query._id) {
                query._id = { ...query._id, $nin: seenIds };
            } else {
                query._id = { $nin: seenIds };
            }
        }

        const results = await sales.find(query)
            .sort({ likes_count: -1, _id: -1 })
            .skip(skip)
            .limit(safeLimit)
            .populate('user_id', 'username email');

        const resultsWithStatus = results.map(doc => {
            const saleObj = doc.toObject({ getters: true, virtuals: true });
            const likedByStrings = saleObj.liked_by ? saleObj.liked_by.map(like => like.user_id.toString()) : [];
            
            return {
                ...saleObj,
                hasLiked: likedByStrings.includes(req.user.id)
            };
        });

        return res.json({
            success: true,
            data: resultsWithStatus,
            page: safePage,
            count: results.length
        });

    } catch (error) {
        console.error("Search Error:", error);
        return res.status(500).json({ success: false, message: "Eroare căutare." });
    }
});*/

userActions.post('/api/sales/like', authUser, fetchLimiter, async (req, res) => {
    try {
        const { sale_id } = req.body;
        const userId = req.user.id;

        const sale = await sales.findById(sale_id);
        if (!sale) {
            return res.status(404).json({ success: false, message: "Anunț negăsit." });
        }

        // Căutăm în array-ul de obiecte dacă userul există deja
        const alreadyLiked = sale.liked_by.some(like => like.user_id.toString() === userId);

        if (alreadyLiked) {
            const result = await sales.findOneAndUpdate(
                { _id: sale_id, "liked_by.user_id": userId }, 
                { 
                    // Scoatem obiectul care are acest user_id
                    $pull: { liked_by: { user_id: userId } },
                    $inc: { likes_count: -1 }
                },
                { new: true }
            );

            if (result && result.likes_count < 0) {
                await sales.findByIdAndUpdate(sale_id, { likes_count: 0 });
            }
            return res.json({ success: true, action: 'unliked' });
        } else {
            const updated = await sales.findOneAndUpdate(
                { _id: sale_id, "liked_by.user_id": { $ne: userId } },
                { 
                    $push: { liked_by: { user_id: userId, liked_at: new Date() } },
                    $inc: { likes_count: 1 }
                },
                { new: true }  // ← obligatoriu ca să primești documentul actualizat cu noul likes_count
            );
             // ─── Notificare milestone likes ───────────────────────────────────────
            const MILESTONES = [5, 10, 30, 50, 100];
            const newCount = updated?.likes_count;
            const ownerId = updated?.user_id?.toString();

            if (newCount && MILESTONES.includes(newCount) && ownerId && ownerId !== userId) {
                const liker = await users.findById(userId).select('username icon').lean();
                await sendAndSaveNotification(
                    [ownerId],
                    {
                        type: 'LIKE_MILESTONE',
                        title: `${newCount} aprecieri 🎉`,
                        body: `Anunțul tău "${updated.brand?.name} ${updated.model?.name}" a ajuns la ${newCount} aprecieri!`,
                        saleId: sale_id,
                        commentId: null
                    },
                    {
                        id: userId,
                        name: liker?.username || '',
                        image: liker?.icon || ''
                    }
                );
            }
            return res.json({ success: true, action: 'liked' });
        }

    } catch (error) {
        console.error("Like Error:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

userActions.post('/api/sales/comment', authUser, fetchLimiter, async (req, res) => {
    try {
        const { sale_id, text, parent_id } = req.body;
        const currentUserId = req.user.id;
        const currentUsername = req.user.username || 'Cineva';

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ success: false, message: "Comentariul nu poate fi gol." });
        }

        if (text.length > 1000) {
            return res.status(400).json({ success: false, message: "Comentariul depășește 1000 de caractere." });
        }

        const saleExists = await sales.findById(sale_id).populate('user_id');
        
        if (!saleExists) {
            return res.status(404).json({ success: false, message: "Anunțul nu mai există." });
        }

        if (saleExists.allow_comments === false) {
            return res.status(403).json({ success: false, message: "Comentariile sunt dezactivate pentru acest anunț." });
        }

        const newComment = new Comments({
            sale_id,
            user_id: currentUserId,
            parent_id: parent_id || null, 
            text: text.trim() 
        });

        await newComment.save();
        await sales.findByIdAndUpdate(sale_id, { $inc: { comments_count: 1 } });

        // ✅ ADAUGĂ ACEST COD NOU AICI
        const ownerId = saleExists.user_id._id.toString();

        // ✅ ADAUGĂ LINIA ASTA SUB EA:
        const currentUserData = await users.findById(currentUserId).select('icon').lean();
        
        // Apoi modifică senderData așa:
        const senderData = {
            id: currentUserId,
            name: currentUsername,
            image: currentUserData?.icon || "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y" // Fallback de siguranță
        };

        // CAZUL A: Este un RĂSPUNS la un alt comentariu (Reply)
        if (parent_id) {
            const parentComment = await Comments.findById(parent_id).select('user_id');
            if (parentComment && parentComment.user_id) {
                const parentAuthorId = parentComment.user_id.toString();
                
                // Nu trimitem notificare dacă își răspunde singur
                if (parentAuthorId !== currentUserId) {
                    await sendAndSaveNotification([parentAuthorId], {
                        type: 'NEW_REPLY',
                        title: 'Răspuns nou',
                        body: `${currentUsername} ți-a răspuns: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
                        saleId: sale_id,
                        commentId: newComment._id.toString()
                    }, senderData);
                }
            }
        } 
        // CAZUL B: Este un COMENTARIU NOU direct la postare
        else {
            // Nu trimitem notificare dacă proprietarul își comentează la propria postare
            if (ownerId !== currentUserId) {
                await sendAndSaveNotification([ownerId], {
                    type: 'NEW_COMMENT',
                    title: 'Comentariu Nou',
                    body: `${currentUsername} a comentat: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
                    saleId: sale_id,
                    commentId: newComment._id.toString()
                }, senderData);
            }
        }
        const populatedComment = await Comments.findById(newComment._id)
            .populate('user_id', 'username icon');

        return res.json({ 
            success: true, 
            data: populatedComment 
        });

    } catch (error) {
        console.error("Comment Error:", error);
        return res.status(500).json({ success: false, message: "Eroare la adăugarea comentariului." });
    }
});

userActions.get('/api/sales/comments/:sale_id', authUser, fetchLimiter, async (req, res) => {
    try {
        const { sale_id } = req.params;
        const { parent_id, target_comment_id } = req.query; 
        
        let limit = parseInt(req.query.limit) || 20;
        let page = parseInt(req.query.page) || 1;
        let skip = (page - 1) * limit;
        
        const userId = req.user.id;

        const currentUserData = await users.findById(userId).select('blocking blocked_by');
        const excludedUserIds = [
            ...(currentUserData.blocking || []),
            ...(currentUserData.blocked_by || [])
        ];

        let sortCriteria;

        if (!parent_id) {
            // Cazul 1: Comentarii principale (Populare + Noi)
            sortCriteria = { likes_count: -1, createdAt: -1 }; 
        } else {
            // Cazul 2: Reply-uri (Cele mai VECHI primele -> Cronologic)
            sortCriteria = { createdAt: 1 }; // 1 înseamnă Ascendent (Oldest first)
        }

        if (target_comment_id && !parent_id) {
            const targetComment = await Comments.findById(target_comment_id);
            
            if (targetComment && targetComment.sale_id.toString() === sale_id) {
                const countBefore = await Comments.countDocuments({
                    sale_id,
                    parent_id: null,
                    is_active: true,
                    user_id: { $nin: excludedUserIds },
                    $or: [
                        { likes_count: { $gt: targetComment.likes_count } },
                        { 
                            likes_count: targetComment.likes_count, 
                            createdAt: { $gt: targetComment.createdAt } 
                        }
                    ]
                });

                page = Math.floor(countBefore / limit) + 1;
                skip = (page - 1) * limit;
            }
        }

        const query = { 
            sale_id, 
            is_active: true,
            parent_id: parent_id || null ,
            user_id: { $nin: excludedUserIds }
        };

        const comments = await Comments.find(query)
            .sort(sortCriteria)
            .skip(skip)
            .limit(limit)
            .populate('user_id', 'username icon')
            .lean();

            const commentIds = comments.map(c => c._id);

            const replyCounts = await Comments.aggregate([
                { 
                    $match: { 
                        parent_id: { $in: commentIds }, 
                        is_active: true, 
                        user_id: { $nin: excludedUserIds.map(id => new mongoose.Types.ObjectId(id)) } 
                    } 
                },
                { $group: { _id: '$parent_id', count: { $sum: 1 } } }
            ]);
            
            const replyMap = {};
            for (const r of replyCounts) {
                replyMap[r._id.toString()] = r.count;
            }
            
            const commentsWithDetails = comments.map(c => {
                const likedByStrings = c.liked_by ? c.liked_by.map(id => id.toString()) : [];
                return {
                    ...c,
                    reply_count: replyMap[c._id.toString()] || 0,
                    has_liked: likedByStrings.includes(userId),
                    user_name: c.user_id?.username || "Utilizator șters",
                    user_image: c.user_id?.icon || null
                };
            });

        return res.json({
            success: true,
            data: commentsWithDetails,
            hasMore: commentsWithDetails.length === limit,
            currentUserId: userId,
            page: page 
        });

    } catch (error) {
        console.error("Get Comments Error:", error);
        return res.status(500).json({ success: false, message: "Eroare la încărcarea comentariilor." });
    }
});

userActions.post('/api/sales/comment/like', authUser, fetchLimiter, async (req, res) => {
    try {
        const { comment_id } = req.body;
        const userId = req.user.id;

        const comment = await Comments.findById(comment_id);
        if (!comment) return res.status(404).json({ success: false, message: "Comentariul nu există." });

        const alreadyLiked = comment.liked_by.includes(userId);

        if (alreadyLiked) {
            await Comments.findByIdAndUpdate(comment_id, {
                $pull: { liked_by: userId },
                $inc: { likes_count: -1 }
            });
            return res.json({ success: true, action: 'unliked' });
        } else {
            await Comments.findByIdAndUpdate(comment_id, {
                $addToSet: { liked_by: userId },
                $inc: { likes_count: 1 }
            });
            return res.json({ success: true, action: 'liked' });
        }

    } catch (error) {
        console.error("Comment Like Error:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

userActions.delete('/api/sales/comment/:comment_id', authUser, fetchLimiter, async (req, res) => {
    try {
        const { comment_id } = req.params;
        const userId = req.user.id;

        const comment = await Comments.findById(comment_id);
        if (!comment) {
            return res.status(404).json({ success: false, message: "Comentariul nu există." });
        }

        const sale = await sales.findById(comment.sale_id);
        
        const isCommentAuthor = comment.user_id.toString() === userId;
        const isPostAuthor = sale && sale.user_id.toString() === userId;

        if (!isCommentAuthor && !isPostAuthor) {
            return res.status(403).json({ success: false, message: "Nu ai permisiunea de a șterge acest comentariu." });
        }

        await Comments.findByIdAndDelete(comment_id);
        await Comments.deleteMany({ parent_id: comment_id });

        return res.json({ success: true, message: "Comentariu șters." });

    } catch (error) {
        console.error("Delete Comment Error:", error);
        return res.status(500).json({ success: false, message: "Eroare la ștergere." });
    }
});


userActions.get('/api/sales/get-one/:id', authUser, fetchLimiter, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const currentUserData = await users.findById(userId).select('blocking blocked_by');
        const excludedUserIds = [
            ...(currentUserData.blocking || []),
            ...(currentUserData.blocked_by || [])
        ];

        const sale = await sales.findById(id)
            .populate('user_id', 'username email')
            .lean();

        if (!sale) {
            return res.status(404).json({ success: false, message: "Anunț negăsit." });
        }

        if (excludedUserIds.some(blockedId => blockedId.toString() === sale.user_id._id.toString())) {
            return res.status(404).json({ success: false, message: "Anunț indisponibil." });
        }

        const likedByStrings = sale.liked_by ? sale.liked_by.map(like => like.user_id ? like.user_id.toString() : '') : [];
        sale.hasLiked = likedByStrings.includes(userId);
        delete sale.liked_by;

        return res.json({ success: true, data: sale });

    } catch (error) {
        return res.status(500).json({ success: false, message: "Server Error" });
    }
});


/*userActions.get('/api/sales/get-one/:id', authUser, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const currentUserData = await users.findById(userId).select('blocking blocked_by');
        const excludedUserIds = [
            ...(currentUserData.blocking || []),
            ...(currentUserData.blocked_by || [])
        ];

        const sale = await sales.findById(id)
            .populate('user_id', 'username email')
            .lean();

        if (!sale) {
            return res.status(404).json({ success: false, message: "Anunț negăsit." });
        }

        if (excludedUserIds.some(blockedId => blockedId.toString() === sale.user_id._id.toString())) {
            return res.status(404).json({ success: false, message: "Anunț indisponibil." });
        }

        const likedByStrings = sale.liked_by ? sale.liked_by.map(like => like.user_id ? like.user_id.toString() : '') : [];
        const saleWithLike = {
            ...sale,
            hasLiked: likedByStrings.includes(userId)
        };

        return res.json({ success: true, data: saleWithLike });

    } catch (error) {
        return res.status(500).json({ success: false, message: "Server Error" });
    }
});*/

userActions.delete('/api/sales/remove/:id', authUser, fetchLimiter, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // 1. Găsim anunțul în baza de date
        const sale = await sales.findById(id);
        if (!sale) {
            return res.status(404).json({ success: false, message: "Anunțul nu există." });
        }

        // 2. Verificăm permisiunile (Securitate critică)
        if (sale.user_id.toString() !== userId) {
            return res.status(403).json({ success: false, message: "Nu ai permisiunea de a șterge acest anunț." });
        }

        // 3. Curățenia Financiară: Anulăm subscripția Stripe (dacă există)
        /*if (sale.stripe_subscription_id) {
            try {
                // Se folosește metoda cancel pentru a opri imediat abonamentul
                await stripe.subscriptions.cancel(sale.stripe_subscription_id);
            } catch (stripeError) {
                // Dacă dă eroare (ex: deja anulat), o logăm doar în consolă, dar mergem mai departe
                console.warn(`Eroare anulare Stripe pentru subscripția ${sale.stripe_subscription_id}:`, stripeError.message);
            }
        }*/

        // 4. Curățenia Găzduirii: Ștergem fișierele Media din Cloudflare R2
        if (sale.media && sale.media.length > 0) {
            const deletePromises = sale.media.map(file => {
                // Verificăm să avem un public_id (cheia din R2)
                if (file.public_id) {
                    const command = new DeleteObjectCommand({
                        Bucket: process.env.R2_BUCKET_NAME,
                        Key: file.public_id
                    });
                    // Prindem și aici eroarea individual ca să nu blocheze ștergerea restului pozelor
                    return r2.send(command).catch(err => console.error(`Eroare ștergere fișier R2 (${file.public_id}):`, err));
                }
                return Promise.resolve();
            });
            
            // Le ștergem pe toate în paralel
            await Promise.all(deletePromises);
        }

        // 5. Curățenia Datelor Orfane: Comentarii și SeenPosts
        await Comments.deleteMany({ sale_id: id });
        await SeenPost.deleteMany({ sale_id: id });

        // 6. Lovitura de grație: Ștergem anunțul propriu-zis
        await sales.findByIdAndDelete(id);

        return res.json({ 
            success: true, 
            message: "Anunțul și toate datele asociate au fost șterse complet." 
        });

    } catch (error) {
        console.error("Eroare Delete Sale:", error);
        return res.status(500).json({ success: false, message: "A apărut o eroare la ștergerea anunțului." });
    }
});

userActions.post('/api/sales/reactivate/:id', authUser, fetchLimiter, async (req, res) => {
    try {
        const { id } = req.params;
        //const { discount_code } = req.body;
        const userId = req.user.id;

        // 1. Verificări de bază & Securitate
        const sale = await sales.findById(id);
        const currentUser = await users.findById(userId);

        if (!sale) {
            return res.status(404).json({ success: false, message: "Anunțul nu există." });
        }
        if (sale.user_id.toString() !== userId) {
            return res.status(403).json({ success: false, message: "Nu ai permisiunea de a reactiva acest anunț." });
        }
        if (sale.is_active) {
            return res.status(400).json({ success: false, message: "Acest anunț este deja activ." });
        }

        // 2. Curățenia Financiară (Clean Slate) - Anulăm vechiul abonament dacă există
        /*if (sale.stripe_subscription_id) {
            try {
                await stripe.subscriptions.cancel(sale.stripe_subscription_id);
            } catch (stripeError) {
                console.warn(`[Stripe Info] Nu am putut anula abonamentul vechi (${sale.stripe_subscription_id}) - probabil e deja anulat.`);
            }
        }*/

        //let discountApplied = 0;

        // 3. Logica de Discount (Exact ca la postare nouă)
        /*if (discount_code) {
            const validCode = await discountCodes.findOneAndUpdate(
                { code: discount_code.toUpperCase(), is_active: true }, 
                { $inc: { current_uses: 1 } }, 
                { new: true }
            );

            if (!validCode) {
                return res.status(400).json({ success: false, message: "Cod de reducere invalid sau expirat." });
            }

            discountApplied = validCode.percentage_off;

            // Dacă e gratuit 100%, bypass complet la Stripe
            if (discountApplied === 100) {
                const now = new Date();
                const paidUntil = addMonths(now, 2); // 2 luni
                const expiresAt = addDays(paidUntil, 10); // 2 luni 10 zile

                sale.is_active = true;
                sale.status = 'active';
                sale.paid_until = paidUntil;
                sale.expires_at = expiresAt;
                sale.stripe_subscription_id = null; // Fără abonament asociat
                await sale.save();

                return res.json({
                    success: true,
                    message: "Anunț reactivat gratuit cu succes!",
                    requiresPayment: false,
                    discountPercentage: 100
                });
            }
        }*/

        const now = new Date();
        const paidUntil = addMonths(now, 3); // 3 luni
        const expiresAt = addDays(paidUntil, 10); // 2 luni 10 zile

        sale.is_active = true;
        sale.status = 'active';
        sale.paid_until = paidUntil;
        sale.expires_at = expiresAt;
        //sale.stripe_subscription_id = null; // Fără abonament asociat
        await sale.save();

        return res.json({
            success: true,
            message: "Anunț reactivat gratuit cu succes!",
            requiresPayment: false,
            discountPercentage: 100
        });

        // 4. Crearea Noului Abonament în Stripe
        /*const customers = await stripe.customers.list({ email: currentUser.email, limit: 1 });
        let customerId = customers.data.length > 0
            ? customers.data[0].id
            : (await stripe.customers.create({ email: currentUser.email, metadata: { userId: currentUser._id.toString() } })).id;

        let subscriptionParams = {
            customer: customerId,
            items: [{ price: process.env.STRIPE_PRICE_ID }],
            payment_behavior: 'default_incomplete',
            payment_settings: { payment_method_types: ['card'], save_default_payment_method: 'on_subscription' },
            expand: ['latest_invoice.payment_intent', 'latest_invoice.confirmation_secret', 'pending_setup_intent'],
            metadata: { saleId: sale._id.toString() }
        };

        // Aplicăm cuponul direct pe abonamentul Stripe (dacă e < 100%)
        if (discountApplied > 0 && discountApplied < 100 && discount_code) {
            subscriptionParams.discounts = [{ coupon: discount_code.toUpperCase() }];
        }

        const subscription = await stripe.subscriptions.create(subscriptionParams);

        // 5. Extragerea Sigură a Cheii de Plată (Compatibil cu update-urile Stripe 2026)
        let invoice = subscription.latest_invoice;
        let pi = invoice?.payment_intent;
        let si = subscription.pending_setup_intent;

        if (typeof pi === 'string') pi = await stripe.paymentIntents.retrieve(pi);
        if (typeof si === 'string') si = await stripe.setupIntents.retrieve(si);

        let clientSecret = pi?.client_secret || si?.client_secret || invoice?.confirmation_secret?.client_secret || invoice?.confirmation_secret;

        if (!clientSecret && subscription.status !== 'active') {
            console.error("DEBUG STRIPE SUBSCRIPTION:", JSON.stringify(subscription, null, 2));
            throw new Error("Stripe API a eșuat în generarea cheii de plată.");
        }

        // 6. Actualizăm Anunțul cu NOUL ID (pentru webhook) și salvăm
        sale.stripe_subscription_id = subscription.id;
        sale.status = 'pending_payment'; // Se va schimba în 'active' de către Webhook
        await sale.save();

        return res.json({
            success: true,
            requiresPayment: true,
            clientSecret,
            discountPercentage: discountApplied
        });
        */
    } catch (error) {
        console.error("Eroare Reactivare Anunț:", error);
        return res.status(500).json({ success: false, message: "Eroare la procesarea reactivării cu Stripe." });
    }
});

userActions.put('/api/sales/edit/:id', authUser, fetchLimiter, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // 1. ZIDUL DE SECURITATE: Extragem STRICT câmpurile permise
        const {
            price,
            mileage,
            vin,
            negotiable,
            county,
            city,
            description,
            phone_number,
            registration_status,
            exchange_accepted,
            for_dismante,
            allow_comments,
            engine_capacity, // 🔥 AICI E NOU
            media, // <-- Îl vom procesa special, nu îl băgăm direct!
            title
        } = req.body;


        // 2. Găsim anunțul și validăm proprietarul
        const sale = await sales.findById(id);
        if (!sale) {
            return res.status(404).json({ success: false, message: "Anunțul nu există." });
        }

        if (sale.user_id.toString() !== userId) {
            return res.status(403).json({ success: false, message: "Nu ai permisiunea de a edita acest anunț." });
        }

        // 3. ACTUALIZAREA SECURIZATĂ A IMAGINILOR (Doar Zoom-ul se modifică)
        // Iterăm prin imaginile deja aprobate din DB și doar le updatăm `zoom_level`-ul
        let updatedMedia = sale.media;
        if (media && Array.isArray(media)) {
            updatedMedia = sale.media.map(existingItem => {
                // Căutăm poza corespondentă venită din frontend
                const incomingItem = media.find(m => m.public_id === existingItem.public_id || m.url === existingItem.url);
                
                // Dacă o găsim și are zoom-ul modificat, aplicăm DOAR zoom-ul.
                if (incomingItem && incomingItem.zoom_level !== undefined) {
                    return {
                        ...existingItem.toObject(), // Păstrăm URL-ul și tipul original intacte
                        zoom_level: Number(incomingItem.zoom_level) || 1
                    };
                }
                return existingItem;
            });
        }

        // 4. SUPRASCRIEREA CÂMPURILOR (Filtrare și Sanitizare)
        // Folosim condiții pentru a ne asigura că nu suprascriem cu undefined din greșeală
        if (price !== undefined) {
            const parsedPrice = Number(String(price).replace(/[^0-9]/g, ''));
            sale.price = !isNaN(parsedPrice) ? parsedPrice : sale.price;
        }
        if (title !== undefined) sale.title = sanitize(title);
        if (mileage !== undefined) {
            const parsedMileage = Number(String(mileage).replace(/[^0-9]/g, ''));
            sale.mileage = !isNaN(parsedMileage) ? parsedMileage : sale.mileage;
        }
        if (vin !== undefined) sale.vin = sanitize(vin).toUpperCase();
        if (negotiable !== undefined) sale.negotiable = String(negotiable) === 'true';
        
        if (county || city) {
            sale.location = {
                county: county ? sanitize(county) : sale.location.county,
                city: city ? sanitize(city) : sale.location.city
            };
        }

        if (engine_capacity !== undefined) {
            sale.engine.capacity = sanitize(engine_capacity);
        }

        if (description !== undefined) sale.description = sanitize(description);
        if (phone_number !== undefined) sale.phone_number = sanitize(phone_number);
        if (registration_status !== undefined) sale.registration_status = sanitize(registration_status);
        if (exchange_accepted !== undefined) sale.exchange_accepted = String(exchange_accepted) === 'true';
        if (for_dismante !== undefined) sale.for_dismante = String(for_dismante) === 'true';
        if (allow_comments !== undefined) sale.allow_comments = String(allow_comments) === 'true';

        sale.media = updatedMedia; // Salvăm array-ul de poze securizat

        // 5. Salvăm în baza de date
        await sale.save();

        return res.json({
            success: true,
            message: "Anunțul a fost actualizat cu succes!"
        });

    } catch (error) {
        console.error("Edit Sale Error:", error);
        return res.status(500).json({ success: false, message: "Eroare la actualizarea anunțului." });
    }
});

// ─── NOU: Endpoint pentru editare cu înlocuire completă de media ─────────────
userActions.put('/api/sales/edit-with-media/:id',
    authUser,
    fetchLimiter,
    upload.array('mediaFiles', 10),
    async (req, res) => {
        try {
            const { id } = req.params;
            const userId = req.user.id;

            // 1. ZIDUL DE SECURITATE: Extragem STRICT câmpurile permise
            const {
                engine_capacity,
                price,
                mileage,
                vin,
                negotiable,
                county,
                city,
                description,
                phone_number,
                registration_status,
                exchange_accepted,
                for_dismante,
                allow_comments,
                old_public_ids,    // JSON string cu public_id-urile pozelor vechi
                media_metadata,     // JSON string cu zoom-urile fișierelor noi
                title
            } = req.body;

            // 2. Găsim anunțul și validăm proprietarul
            const sale = await sales.findById(id);
            if (!sale) {
                return res.status(404).json({ success: false, message: "Anunțul nu există." });
            }

            if (sale.user_id.toString() !== userId) {
                return res.status(403).json({ success: false, message: "Nu ai permisiunea de a edita acest anunț." });
            }

            // 3. Validăm fișierele noi primite
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ success: false, message: "Este necesar cel puțin un fișier media nou." });
            }

            let videoCount = 0;
            const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
            const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

            for (const file of req.files) {
                const isVideo = file.mimetype.startsWith('video/');
                const isImage = file.mimetype.startsWith('image/');

                if (isVideo) {
                    videoCount++;
                    if (videoCount > 1) {
                        return res.status(400).json({ success: false, message: "Maxim 1 videoclipuri permis." });
                    }
                    if (file.size > MAX_VIDEO_SIZE) {
                        return res.status(400).json({ success: false, message: "Un fișier video depășește limita de 50MB." });
                    }
                } else if (isImage) {
                    if (file.size > MAX_IMAGE_SIZE) {
                        return res.status(400).json({ success: false, message: "O imagine depășește limita de 15MB." });
                    }
                }
            }

            // 4. Parsăm metadatele
            let parsedMetadata = [];
            try {
                if (media_metadata) {
                    parsedMetadata = JSON.parse(media_metadata);
                }
            } catch (e) {
                console.warn("⚠️ Eroare la parsarea media_metadata, vom folosi zoom default.", e.message);
                parsedMetadata = [];
            }

            let parsedOldPublicIds = [];
            try {
                if (old_public_ids) {
                    parsedOldPublicIds = JSON.parse(old_public_ids);
                }
            } catch (e) {
                console.warn("⚠️ Eroare la parsarea old_public_ids.", e.message);
                parsedOldPublicIds = [];
            }

            // 5. Actualizăm câmpurile text pe sale — media NU se atinge acum,
            //    pozele vechi rămân vizibile în feed până când workerul termină
            if (price !== undefined) {
                const parsedPrice = Number(String(price).replace(/[^0-9]/g, ''));
                sale.price = !isNaN(parsedPrice) ? parsedPrice : sale.price;
            }
            if (title !== undefined) sale.title = sanitize(title);
            if (mileage !== undefined) {
                const parsedMileage = Number(String(mileage).replace(/[^0-9]/g, ''));
                sale.mileage = !isNaN(parsedMileage) ? parsedMileage : sale.mileage;
            }
            if (vin !== undefined) sale.vin = sanitize(vin).toUpperCase();
            if (negotiable !== undefined) sale.negotiable = String(negotiable) === 'true';

            if (county || city) {
                sale.location = {
                    county: county ? sanitize(county) : sale.location.county,
                    city: city ? sanitize(city) : sale.location.city
                };
            }

            if (engine_capacity !== undefined) {
                sale.engine.capacity = sanitize(engine_capacity);
            }

            if (description !== undefined) sale.description = sanitize(description);
            if (phone_number !== undefined) sale.phone_number = sanitize(phone_number);
            if (registration_status !== undefined) sale.registration_status = sanitize(registration_status);
            if (exchange_accepted !== undefined) sale.exchange_accepted = String(exchange_accepted) === 'true';
            if (for_dismante !== undefined) sale.for_dismante = String(for_dismante) === 'true';
            if (allow_comments !== undefined) sale.allow_comments = String(allow_comments) === 'true';

            // 6. Salvăm câmpurile text — fără să atingem sale.media
            await sale.save();

            // 7. Punem fișierele noi în coada BullMQ cu flag isMediaUpdate
            await addMediaUpdateToQueue(id, req.files, parsedOldPublicIds, parsedMetadata);

            // 8. Răspundem imediat — nu așteptăm procesarea
            return res.json({
                success: true,
                message: "Modificările au fost salvate! Pozele noi se procesează în fundal."
            });

        } catch (error) {
            console.error("Edit With Media Error:", error);
            return res.status(500).json({ success: false, message: "Eroare internă la actualizarea anunțului." });
        }
    }
);


userActions.get('/post/:saleId', fetchLimiter, (req, res) => {
    const { saleId } = req.params;
    const appScheme = `carflip://post/${saleId}`;
    const playStore = 'https://play.google.com/store/apps/details?id=com.mobilefrontendframe'
    const appStore = 'https://apps.apple.com/ro/app/id6760683057';

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CarFlip.ro</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    background-color: #800000;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                }
                .text { color: white; font-size: 18px; margin-top: 20px; opacity: 0.9; }
                .subtext { color: rgba(255,255,255,0.6); font-size: 14px; margin-top: 10px; }
            </style>
        </head>
        <body>
            <p class="text">Se deschide CarFlip...</p>
            <p class="subtext">Dacă nu se deschide automat, apasă butonul</p>
            <button onclick="openApp()" style="margin-top:20px; background:white; color:#800000; border:none; padding:14px 36px; border-radius:25px; font-size:16px; font-weight:bold; cursor:pointer;">
                Deschide anunțul
            </button>
            <script>
                const ua = navigator.userAgent.toLowerCase();
                const isIOS = /iphone|ipad|ipod/.test(ua);
                const isAndroid = /android/.test(ua);
                const storeUrl = isIOS ? '${appStore}' : '${playStore}';

                function openApp() {
                    window.location = '${appScheme}';
                    setTimeout(() => { window.location = storeUrl; }, 2500);
                }

                // Pe Android mergem automat, pe iOS Safari necesită gesture
                if (isAndroid) openApp();
            </script>
        </body>
        </html>
    `);
});

userActions.get('/profile/:userId', fetchLimiter, (req, res) => {
    const { userId } = req.params;
    const appScheme = `carflip://profile/${userId}`;
    const playStore = 'https://play.google.com/store/apps/details?id=com.mobilefrontendframe';
    const appStore = 'https://apps.apple.com/ro/app/id6760683057';

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CarFlip.ro</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    background-color: #800000;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                }
                .text { color: white; font-size: 18px; margin-top: 20px; opacity: 0.9; }
                .subtext { color: rgba(255,255,255,0.6); font-size: 14px; margin-top: 10px; }
            </style>
        </head>
        <body>
            <p class="text">Se deschide CarFlip...</p>
            <p class="subtext">Dacă nu se deschide automat, apasă butonul</p>
            <button onclick="openApp()" style="margin-top:20px; background:white; color:#800000; border:none; padding:14px 36px; border-radius:25px; font-size:16px; font-weight:bold; cursor:pointer;">
                Deschide profilul
            </button>
            <script>
                const ua = navigator.userAgent.toLowerCase();
                const isIOS = /iphone|ipad|ipod/.test(ua);
                const isAndroid = /android/.test(ua);
                const storeUrl = isIOS ? '${appStore}' : '${playStore}';

                function openApp() {
                    window.location = '${appScheme}';
                    setTimeout(() => { window.location = storeUrl; }, 2500);
                }

                if (isAndroid) openApp();
            </script>
        </body>
        </html>
    `);
});

userActions.get('/info/stergere-cont', fetchLimiter, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ștergere cont - CarFlip.ro</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    background-color: #800000;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    padding: 20px;
                    text-align: center;
                }
                .text { color: white; font-size: 18px; margin-top: 20px; opacity: 0.9; }
                .subtext { color: rgba(255,255,255,0.8); font-size: 14px; margin-top: 10px; line-height: 1.5; }
                a { color: #ffd700; text-decoration: none; }
            </style>
        </head>
        <body>
            <p class="text">Poți șterge contul CarFlip.ro direct din aplicație, în secțiunea <strong>Profil → Securitate → Ștergere cont</strong>.</p>
            
            <p class="subtext">Dacă întâmpini probleme cu ștergerea contului, trimite un email la: <a href="mailto:carflip.ro@outlook.com">carflip.ro@outlook.com</a></p>
            
            <p class="subtext">Toate datele asociate contului tău (anunțuri, mesaje, profil) vor fi șterse complet în termen de 30 de zile. Datele anonimizate pot fi păstrate temporar în backup-uri pentru securitate și conformitate legală.</p>
        </body>
        </html>
    `);
});

userActions.get('/api/sales/public-feed', fetchLimiter, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const cursor = req.query.cursor;
        const mode = req.query.mode || 'new';

        const pipeline = [];

        const baseMatch = { is_active: true };

        if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
            baseMatch._id = { $lt: new mongoose.Types.ObjectId(cursor) };
        }

        pipeline.push({ $match: baseMatch });
        pipeline.push({ $sort: { _id: -1 } });
        pipeline.push({ $limit: limit });

        pipeline.push({
            $project: {
                liked_by: 0
            }
        });

        pipeline.push({
            $lookup: {
                from: 'users',
                localField: 'user_id',
                foreignField: '_id',
                pipeline: [
                    { $project: { username: 1, email: 1 } }
                ],
                as: '_user_populated'
            }
        });

        pipeline.push({
            $addFields: {
                user_id: { $arrayElemAt: ['$_user_populated', 0] },
                hasLiked: false
            }
        });

        pipeline.push({ $project: { _user_populated: 0 } });
        pipeline.push({ $match: { user_id: { $ne: null } } });

        const foundSales = await sales.aggregate(pipeline);

        let nextCursor = null;
        if (foundSales.length > 0) {
            nextCursor = foundSales[foundSales.length - 1]._id;
        }

        if (mode === 'new' && foundSales.length === 0) {
            return res.json({
                success: true,
                data: [],
                nextCursor: null,
                endOfNewPosts: true
            });
        }

        return res.json({
            success: true,
            data: foundSales,
            nextCursor,
            endOfNewPosts: false
        });

    } catch (error) {
        console.error("Public Feed Error:", error);
        return res.status(500).json({ success: false, message: "Eroare la încărcarea feed-ului." });
    }
});


userActions.get('/api/sales/search-list', authUser, fetchLimiter, async (req, res) => {
    try {
        const {
            brand_id, model_id,
            min_price, max_price,
            min_year, max_year,
            min_km, max_km,
            fuel_type, body_type, transmission,
            pollution_standard, registration_status,
            county, city, for_dismante,
            exclude_seen,
            steering_wheel, negotiable,
            cursor,
            limit = 20,
        } = req.query;

        const safeNum = (val) => {
            if (val === undefined || val === null || val === '') return null;
            if (Array.isArray(val)) return null;
            const cleanVal = String(val).trim();
            const num = Number(cleanVal);
            return isNaN(num) ? null : num;
        };

        const safeRegex = (val) => {
            if (!val || val === 'null' || val === 'undefined') return null;
            const cleaned = String(val).trim();
            const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(escaped, 'i');
        };

        const currentUserData = await users.findById(req.user.id).select('blocking blocked_by');

        const excludedUserIds = [
            ...(currentUserData.blocking || []),
            ...(currentUserData.blocked_by || [])
        ];

        let query = {
            is_active: true,
            user_id: { $nin: excludedUserIds }
        };

        const sBrand = safeNum(brand_id);
        const sModel = safeNum(model_id);
        if (sBrand !== null) query['brand.id'] = sBrand;
        if (sModel !== null) query['model.id'] = sModel;

        if (fuel_type) query['engine.fuel_type'] = String(fuel_type).trim();
        if (body_type) query.body_type = String(body_type).trim();
        if (transmission) query.transmission = String(transmission).trim();
        if (pollution_standard) query.pollution_standard = String(pollution_standard).trim();
        if (registration_status) query.registration_status = registration_status.trim();
        if (county) query['location.county'] = safeRegex(county);
        if (city) query['location.city'] = safeRegex(city);

        if (for_dismante !== undefined) {
            query.for_dismante = (for_dismante === 'true' || for_dismante === true);
        }

        if (steering_wheel) {
            query.steering_wheel = steering_wheel;
        }

        if (negotiable !== undefined) {
            query.negotiable = (negotiable === 'true' || negotiable === true);
        }

        const minP = safeNum(min_price);
        const maxP = safeNum(max_price);
        if (minP !== null || maxP !== null) {
            if (!query.price) query.price = {};
            if (minP !== null) query.price.$gte = minP;
            if (maxP !== null) query.price.$lte = maxP;
        }

        const minY = safeNum(min_year);
        const maxY = safeNum(max_year);
        if (minY !== null || maxY !== null) {
            if (!query.production_year) query.production_year = {};
            if (minY !== null) query.production_year.$gte = minY;
            if (maxY !== null) query.production_year.$lte = maxY;
        }

        const minK = safeNum(min_km);
        const maxK = safeNum(max_km);
        if (minK !== null || maxK !== null) {
            if (!query.mileage) query.mileage = {};
            if (minK !== null) query.mileage.$gte = minK;
            if (maxK !== null) query.mileage.$lte = maxK;
        }

        const safeLimit = Math.max(1, Math.min(50, safeNum(limit) || 20));
        const userObjectId = new mongoose.Types.ObjectId(req.user.id);

        // ── CURSOR DECODE ─────────────────────────────────────────────
        // Cursor encodes the last item's likes_count + _id for stable
        // pagination on compound sort { likes_count: -1, _id: -1 }

        if (cursor) {
            try {
                const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
                const cursorLikes = Number(decoded.l);
                const cursorId = new mongoose.Types.ObjectId(decoded.id);

                query.$or = [
                    { likes_count: { $lt: cursorLikes } },
                    { likes_count: cursorLikes, _id: { $lt: cursorId } }
                ];
            } catch (e) {
                return res.status(400).json({ success: false, message: "Cursor invalid." });
            }
        }

        // ── AGGREGATION PIPELINE ──────────────────────────────────────

        const pipeline = [];

        pipeline.push({ $match: query });

        pipeline.push({ $sort: { likes_count: -1, _id: -1 } });

        if (exclude_seen === 'true') {
            pipeline.push({
                $lookup: {
                    from: 'seenposts',
                    let: { saleId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$sale_id', '$$saleId'] },
                                        { $eq: ['$user_id', userObjectId] }
                                    ]
                                }
                            }
                        },
                        { $limit: 1 }
                    ],
                    as: 'seenCheck'
                }
            });
            pipeline.push({ $match: { seenCheck: { $size: 0 } } });
        }

        pipeline.push({ $limit: safeLimit + 1 });

        pipeline.push({
            $addFields: {
                hasLiked: {
                    $cond: {
                        if: { $isArray: '$liked_by' },
                        then: {
                            $anyElementTrue: {
                                $map: {
                                    input: '$liked_by',
                                    as: 'like',
                                    in: { $eq: ['$$like.user_id', userObjectId] }
                                }
                            }
                        },
                        else: false
                    }
                }
            }
        });

        const projectOut = { liked_by: 0 };
        if (exclude_seen === 'true') {
            projectOut.seenCheck = 0;
        }
        pipeline.push({ $project: projectOut });

        pipeline.push({
            $lookup: {
                from: 'users',
                localField: 'user_id',
                foreignField: '_id',
                pipeline: [
                    { $project: { username: 1, email: 1 } }
                ],
                as: '_user_populated'
            }
        });

        pipeline.push({
            $addFields: {
                user_id: { $arrayElemAt: ['$_user_populated', 0] }
            }
        });

        pipeline.push({ $project: { _user_populated: 0 } });

        pipeline.push({ $match: { user_id: { $ne: null } } });

        // ── EXECUTE ───────────────────────────────────────────────────

        const results = await sales.aggregate(pipeline);

        // ── BUILD NEXT CURSOR ─────────────────────────────────────────

        let nextCursor = null;
        let hasMore = false;

        if (results.length > safeLimit) {
            hasMore = true;
            results.pop();
            const lastItem = results[results.length - 1];
            const cursorPayload = { l: lastItem.likes_count || 0, id: lastItem._id.toString() };
            nextCursor = Buffer.from(JSON.stringify(cursorPayload)).toString('base64url');
        }

        return res.json({
            success: true,
            data: results,
            nextCursor,
            hasMore,
            count: results.length
        });

    } catch (error) {
        console.error("Search List Error:", error);
        return res.status(500).json({ success: false, message: "Eroare căutare." });
    }
});

export default userActions;