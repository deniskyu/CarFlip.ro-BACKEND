import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import Redis from "ioredis";
import admins from "../models/adminModel.js";
import users from "../models/userModel.js";
import Reports from "../models/reportModel.js";
import sales from "../models/salesModel.js";
import Comments from "../models/commentModel.js";
import Message from "../models/messageModel.js";
import brands from "../models/brandModel.js";
import automobiles from "../models/automobileModel.js";
import dotenv from "dotenv";
dotenv.config();

const adminRoute = Router();

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

export const authAdmin = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(" ")[1];
        if (!token) return res.status(401).json({ success: false, message: "Neautorizat" });

        const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
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

// ===================== AUTH =====================

adminRoute.post("/api/admin/login", adminLoginLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
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
    if (!username) return res.status(400).json({ success: false, message: "Username obligatoriu." });

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
    try {
        const user = await users.findById(req.params.userId);
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
    const { status } = req.body;
    if (!status || !["resolved", "dismissed"].includes(status))
        return res.status(400).json({ success: false, message: "Status invalid." });

    try {
        const report = await Reports.findByIdAndUpdate(
            req.params.reportId,
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
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: "Numele este obligatoriu." });

    try {
        const existing = await brands.findOne({ name: name.trim() });
        if (existing) return res.status(400).json({ success: false, message: "Brandul există deja." });

        const last = await brands.findOne().sort({ id: -1 }).lean();
        const newId = last ? last.id + 1 : 1;

        const newBrand = await brands.create({ id: newId, name: name.trim() });
        return res.json({ success: true, message: "Brand adăugat.", brand: newBrand });
    } catch (err) {
        console.error("Admin add brand error:", err);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

adminRoute.delete("/api/admin/brands/:brandId", adminFetchLimiter, authAdmin, async (req, res) => {
    try {
        const brand = await brands.findOne({ id: parseInt(req.params.brandId) });
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
    try {
        const allModels = await automobiles.find({ brand_id: parseInt(req.params.brandId) }).sort({ name: 1 }).lean();
        return res.json({ success: true, automobiles: allModels });
    } catch (err) {
        console.error("Admin automobiles error:", err);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

adminRoute.post("/api/admin/automobiles", adminFetchLimiter, authAdmin, async (req, res) => {
    const { name, brand_id } = req.body;
    if (!name || !name.trim() || !brand_id)
        return res.status(400).json({ success: false, message: "Numele și brand_id sunt obligatorii." });

    try {
        const brand = await brands.findOne({ id: brand_id });
        if (!brand) return res.status(404).json({ success: false, message: "Brandul nu există." });

        const existing = await automobiles.findOne({ name: name.trim(), brand_id });
        if (existing) return res.status(400).json({ success: false, message: "Modelul există deja la acest brand." });

        const last = await automobiles.findOne().sort({ id: -1 }).lean();
        const newId = last ? last.id + 1 : 1;

        const newModel = await automobiles.create({ id: newId, name: name.trim(), brand_id });
        return res.json({ success: true, message: "Model adăugat.", automobile: newModel });
    } catch (err) {
        console.error("Admin add automobile error:", err);
        return res.status(500).json({ success: false, message: "Eroare server." });
    }
});

adminRoute.delete("/api/admin/automobiles/:automobileId", adminFetchLimiter, authAdmin, async (req, res) => {
    try {
        const automobile = await automobiles.findOne({ id: parseInt(req.params.automobileId) });
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