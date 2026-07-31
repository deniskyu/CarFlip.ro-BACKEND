import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import Redis from "ioredis";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

import admins from "../models/adminModel.js";
import users from "../models/userModel.js";
import Reports from "../models/reportModel.js";
import sales from "../models/salesModel.js";
import Comments from "../models/commentModel.js";
import Message from "../models/messageModel.js";
import SeenPost from "../models/seenPostsModel.js";
import brands from "../models/brandsModel.js";
import automobiles from "../models/automobilesModel.js";
import { enqueueSocialCleanup } from "../services/socialPromo/socialPromoService.js";

import dotenv from "dotenv";
dotenv.config();

const adminRoute = Router();

// ==========================================
// CLOUDFLARE R2 (doar ștergere)
// ==========================================
const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

// Ștergere best-effort: nu aruncă niciodată, ca să nu blocheze restul operațiunii.
const deleteFromR2 = async (key) => {
    if (!key || typeof key !== "string") return;
    try {
        await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
    } catch (err) {
        console.warn(`[Admin] R2 delete skip (${key}):`, err.message);
    }
};

// ==========================================
// RATE LIMITERS
// ==========================================
const rateLimitRedis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 20,
    enableReadyCheck: true,
});

const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    store: new RedisStore({
        sendCommand: (...args) => rateLimitRedis.call(...args),
        prefix: "r1:admin:login:",
    }),
    message: { success: false, message: "Prea multe încercări. Încearcă mai târziu." },
});

const adminFetchLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 6000,
    store: new RedisStore({
        sendCommand: (...args) => rateLimitRedis.call(...args),
        prefix: "r1:admin:fetch:",
    }),
    message: { success: false, message: "Prea multe request-uri." },
});

// Limiter dedicat pentru acțiuni distructive (ștergere/ban din raport).
// Generos pentru moderare umană, dar limitează blast radius-ul unui token furat.
const adminActionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    store: new RedisStore({
        sendCommand: (...args) => rateLimitRedis.call(...args),
        prefix: "r1:admin:action:",
    }),
    message: { success: false, message: "Prea multe acțiuni. Încearcă mai târziu." },
});

// ==========================================
// MIDDLEWARE
// ==========================================
export const authAdmin = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(" ")[1];
        if (!token) return res.status(401).json({ success: false, message: "Neautorizat" });

        // Algoritm fixat -> previne alg-confusion / alg:none.
        const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET, { algorithms: ["HS256"] });
        req.admin = { id: decoded.id, email: decoded.email };

        const timeLeft = decoded.exp * 1000 - Date.now();
        if (timeLeft < 7 * 24 * 60 * 60 * 1000) {
            const newToken = jwt.sign(
                { id: decoded.id, email: decoded.email },
                process.env.ADMIN_JWT_SECRET,
                { expiresIn: "30d" }
            );
            res.setHeader("X-New-Token", newToken);
        }

        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: "Token invalid sau expirat" });
    }
};

// Helper validare ObjectId (params sunt mereu string, dar pot fi invalizi).
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// ===================== AUTH =====================
adminRoute.post("/api/admin/login", adminLoginLimiter, async (req, res) => {
    const { email, password } = req.body;

    // Type guards -> blochează NoSQL injection ({ $ne: ... } etc.)
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password)
        return res.status(400).json({ success: false, message: "Câmpurile sunt obligatorii." });

    try {
        const admin = await admins.findOne({ email: email.trim().toLowerCase() });
        if (!admin) return res.status(401).json({ success: false, message: "Credențiale invalide." });

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) return res.status(401).json({ success: false, message: "Credențiale invalide." });

        const token = jwt.sign(
            { id: admin._id, email: admin.email },
            process.env.ADMIN_JWT_SECRET,
            { expiresIn: "30d" }
        );

        return res.json({ success: true, token });
    } catch (err) {
        console.error("Admin login error:", err);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

adminRoute.get("/api/admin/verify", adminFetchLimiter, authAdmin, (req, res) => {
    return res.json({ success: true, email: req.admin.email });
});

// ===================== USER SEARCH + BAN/UNBAN =====================
adminRoute.get("/api/admin/user/search", adminFetchLimiter, authAdmin, async (req, res) => {
    const { username } = req.query;

    // qs poate parsa ?username[$ne]= într-un obiect -> type guard obligatoriu.
    if (typeof username !== "string" || !username.trim())
        return res.status(400).json({ success: false, message: "Username obligatoriu." });

    try {
        const user = await users.findOne({ username: username.trim() }).select("_id username email isBanned icon createdAt");
        if (!user) return res.json({ success: false, message: "Utilizatorul nu a fost găsit." });

        return res.json({ success: true, user });
    } catch (err) {
        console.error("Admin user search error:", err);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

adminRoute.put("/api/admin/user/ban/:userId", adminFetchLimiter, authAdmin, async (req, res) => {
    const { userId } = req.params;
    if (!isValidObjectId(userId))
        return res.status(400).json({ success: false, message: "ID utilizator invalid." });

    try {
        const user = await users.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: "Utilizatorul nu a fost găsit." });

        user.isBanned = !user.isBanned;

        // Dacă banăm, invalidăm toate sesiunile
        if (user.isBanned) {
            user.refreshTokens = [];
            user.markModified("refreshTokens");
        }

        await user.save();

        return res.json({
            success: true,
            message: user.isBanned ? "Utilizatorul a fost banat." : "Utilizatorul a fost debanat.",
            isBanned: user.isBanned,
        });
    } catch (err) {
        console.error("Admin ban error:", err);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

// ===================== REPORTS =====================
adminRoute.get("/api/admin/reports", adminFetchLimiter, authAdmin, async (req, res) => {
    try {
        const reports = await Reports.find({ status: "pending" }).sort({ createdAt: -1 }).lean();

        // Populate manual în funcție de target_type
        const populated = await Promise.all(
            reports.map(async (report) => {
                const result = { ...report };

                // Reporter info
                const reporter = await users.findById(report.reporter_id).select("username").lean();
                result.reporter_name = reporter?.username || "Utilizator șters";

                // Target info
                if (report.target_type === "post") {
                    const post = await sales.findById(report.target_id)
                        .select("user_id user_name description media brand model price")
                        .lean();
                    result.target = post || null;
                } else if (report.target_type === "comment") {
                    const comment = await Comments.findById(report.target_id)
                        .select("user_id text sale_id")
                        .lean();
                    if (comment) {
                        const commentUser = await users.findById(comment.user_id).select("username").lean();
                        comment.username = commentUser?.username || "Utilizator șters";
                    }
                    result.target = comment || null;
                } else if (report.target_type === "profile") {
                    const profile = await users.findById(report.target_id)
                        .select("username icon email isBanned")
                        .lean();
                    result.target = profile || null;
                } else if (report.target_type === "message") {
                    const message = await Message.findById(report.target_id)
                        .select("sender_id text image_url type")
                        .lean();
                    if (message) {
                        const msgUser = await users.findById(message.sender_id).select("username").lean();
                        message.username = msgUser?.username || "Utilizator șters";
                    }
                    result.target = message || null;
                }

                return result;
            })
        );

        return res.json({ success: true, reports: populated });
    } catch (err) {
        console.error("Admin reports error:", err);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

adminRoute.put("/api/admin/reports/:reportId", adminFetchLimiter, authAdmin, async (req, res) => {
    const { reportId } = req.params;
    const { status } = req.body;

    if (!isValidObjectId(reportId))
        return res.status(400).json({ success: false, message: "ID raport invalid." });

    if (typeof status !== "string" || !["resolved", "dismissed"].includes(status))
        return res.status(400).json({ success: false, message: "Status invalid." });

    try {
        const report = await Reports.findByIdAndUpdate(
            reportId,
            { status },
            { new: true }
        );

        if (!report) return res.status(404).json({ success: false, message: "Raportul nu a fost găsit." });

        return res.json({ success: true, message: `Raportul a fost marcat ca ${status}.`, report });
    } catch (err) {
        console.error("Admin report update error:", err);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

// ──────────────────────────────────────────────────────────────────────────
//  ACȚIUNE DISTRUCTIVĂ PE RAPORT (Șterge conținut / Banează profil) + auto-dismiss
//  POST /api/admin/reports/:reportId/action
//  Server-ul deduce acțiunea din target_type-ul raportului. Indiferent de tip,
//  la final raportul devine 'dismissed'. Idempotent: dacă target-ul nu mai
//  există sau raportul e deja procesat, doar îl închide curat.
// ──────────────────────────────────────────────────────────────────────────
adminRoute.post("/api/admin/reports/:reportId/action", adminActionLimiter, authAdmin, async (req, res) => {
    const { reportId } = req.params;

    if (!isValidObjectId(reportId))
        return res.status(400).json({ success: false, message: "ID raport invalid." });

    try {
        const report = await Reports.findById(reportId);
        if (!report) return res.status(404).json({ success: false, message: "Raportul nu a fost găsit." });

        // Guard anti-dublu-procesare (ex: două taburi / dublu-click).
        if (report.status !== "pending") {
            return res.json({ success: true, message: "Raportul a fost deja procesat." });
        }

        let resultMessage = "Raportul a fost închis.";

        switch (report.target_type) {
            case "post": {
                const sale = await sales.findById(report.target_id);
                if (sale) {
                    // 1. Media din R2 (paralel, best-effort)
                    if (Array.isArray(sale.media)) {
                        await Promise.all(sale.media.map((file) => deleteFromR2(file?.public_id)));
                    }

                    // 2. Curățenie orfani
                    await Comments.deleteMany({ sale_id: sale._id });
                    await SeenPost.deleteMany({ sale_id: sale._id });

                    // 3. Postarea de pe rețelele sociale — ÎNAINTE de ștergerea
                    //    documentului, altfel se pierde zernio_post_id-ul.
                    await enqueueSocialCleanup(sale);

                    // 4. Anunțul
                    await sales.deleteOne({ _id: sale._id });

                    resultMessage = "Anunțul a fost șters și raportul închis.";
                } else {
                    resultMessage = "Anunțul nu mai există. Raportul a fost închis.";
                }
                break;
            }

            case "comment": {
                const comment = await Comments.findById(report.target_id);
                if (comment) {
                    await Comments.deleteOne({ _id: comment._id });
                    await Comments.deleteMany({ parent_id: comment._id });
                    resultMessage = "Comentariul a fost șters și raportul închis.";
                } else {
                    resultMessage = "Comentariul nu mai există. Raportul a fost închis.";
                }
                break;
            }

            case "message": {
                const msg = await Message.findById(report.target_id);
                if (msg) {
                    if (msg.type === "image" && msg.image_public_id) {
                        await deleteFromR2(msg.image_public_id);
                    }
                    msg.is_deleted = true;
                    msg.image_url = null;
                    msg.image_public_id = null;
                    await msg.save();
                    resultMessage = "Mesajul a fost șters și raportul închis.";
                } else {
                    resultMessage = "Mesajul nu mai există. Raportul a fost închis.";
                }
                break;
            }

            case "profile": {
                const user = await users.findById(report.target_id);
                if (user) {
                    user.isBanned = true; // idempotent (set true, NU toggle)
                    user.refreshTokens = [];
                    user.markModified("refreshTokens");
                    await user.save();
                    resultMessage = "Utilizatorul a fost banat și raportul închis.";
                } else {
                    resultMessage = "Utilizatorul nu mai există. Raportul a fost închis.";
                }
                break;
            }

            default:
                resultMessage = "Tip de raport necunoscut. Raportul a fost închis.";
                break;
        }

        // Auto-dismiss
        report.status = "dismissed";
        await report.save();

        return res.json({ success: true, message: resultMessage });
    } catch (err) {
        console.error("Admin report action error:", err);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

// ===================== BRANDS =====================
adminRoute.get("/api/admin/brands", adminFetchLimiter, authAdmin, async (req, res) => {
    try {
        const allBrands = await brands.find().sort({ name: 1 }).lean();
        return res.json({ success: true, brands: allBrands });
    } catch (err) {
        console.error("Admin brands error:", err);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

adminRoute.post("/api/admin/brands", adminFetchLimiter, authAdmin, async (req, res) => {
    const { name } = req.body;
    if (typeof name !== "string" || !name.trim())
        return res.status(400).json({ success: false, message: "Numele este obligatoriu." });

    try {
        const cleanName = name.trim();
        const existing = await brands.findOne({ name: cleanName });
        if (existing) return res.status(400).json({ success: false, message: "Brandul există deja." });

        const last = await brands.findOne().sort({ id: -1 }).lean();
        const newId = last ? last.id + 1 : 1;

        const newBrand = await brands.create({ id: newId, name: cleanName });
        return res.json({ success: true, message: "Brand adăugat.", brand: newBrand });
    } catch (err) {
        console.error("Admin add brand error:", err);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

adminRoute.delete("/api/admin/brands/:brandId", adminFetchLimiter, authAdmin, async (req, res) => {
    const brandId = parseInt(req.params.brandId, 10);
    if (!Number.isInteger(brandId))
        return res.status(400).json({ success: false, message: "ID brand invalid." });

    try {
        const brand = await brands.findOne({ id: brandId });
        if (!brand) return res.status(404).json({ success: false, message: "Brandul nu a fost găsit." });

        await automobiles.deleteMany({ brand_id: brand.id });
        await brands.deleteOne({ id: brand.id });

        return res.json({ success: true, message: `Brandul "${brand.name}" și toate modelele au fost șterse.` });
    } catch (err) {
        console.error("Admin delete brand error:", err);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

// ===================== AUTOMOBILES =====================
adminRoute.get("/api/admin/brands/:brandId/automobiles", adminFetchLimiter, authAdmin, async (req, res) => {
    const brandId = parseInt(req.params.brandId, 10);
    if (!Number.isInteger(brandId))
        return res.status(400).json({ success: false, message: "ID brand invalid." });

    try {
        const allModels = await automobiles.find({ brand_id: brandId }).sort({ name: 1 }).lean();
        return res.json({ success: true, automobiles: allModels });
    } catch (err) {
        console.error("Admin automobiles error:", err);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

adminRoute.post("/api/admin/automobiles", adminFetchLimiter, authAdmin, async (req, res) => {
    const { name } = req.body;
    const brand_id = Number(req.body.brand_id);

    if (typeof name !== "string" || !name.trim() || !Number.isInteger(brand_id))
        return res.status(400).json({ success: false, message: "Numele și brand_id sunt obligatorii." });

    try {
        const cleanName = name.trim();
        const brand = await brands.findOne({ id: brand_id });
        if (!brand) return res.status(404).json({ success: false, message: "Brandul nu există." });

        const existing = await automobiles.findOne({ name: cleanName, brand_id });
        if (existing) return res.status(400).json({ success: false, message: "Modelul există deja la acest brand." });

        const last = await automobiles.findOne().sort({ id: -1 }).lean();
        const newId = last ? last.id + 1 : 1;

        const newModel = await automobiles.create({ id: newId, name: cleanName, brand_id });
        return res.json({ success: true, message: "Model adăugat.", automobile: newModel });
    } catch (err) {
        console.error("Admin add automobile error:", err);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

adminRoute.delete("/api/admin/automobiles/:automobileId", adminFetchLimiter, authAdmin, async (req, res) => {
    const automobileId = parseInt(req.params.automobileId, 10);
    if (!Number.isInteger(automobileId))
        return res.status(400).json({ success: false, message: "ID model invalid." });

    try {
        const automobile = await automobiles.findOne({ id: automobileId });
        if (!automobile) return res.status(404).json({ success: false, message: "Modelul nu a fost găsit." });

        await automobiles.deleteOne({ id: automobile.id });

        return res.json({ success: true, message: `Modelul "${automobile.name}" a fost șters.` });
    } catch (err) {
        console.error("Admin delete automobile error:", err);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

// ===================== INFO / STATS =====================
adminRoute.get("/api/admin/stats", adminFetchLimiter, authAdmin, async (req, res) => {
    try {
        const [totalSales, totalUsers] = await Promise.all([
            sales.countDocuments(),
            users.countDocuments({ isVerified: true }),
        ]);

        return res.json({ success: true, totalSales, totalUsers });
    } catch (err) {
        console.error("Admin stats error:", err);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

export default adminRoute;
