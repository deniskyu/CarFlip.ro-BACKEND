import { Router } from "express";
import dotenv from 'dotenv';
dotenv.config();

import { rateLimit } from 'express-rate-limit';
import users from "../models/userModel.js";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { checkSchema, validationResult } from "express-validator";
import { userValidationSchema } from "../validationSchemas/userValidationSchema.js";
import sales from '../models/salesModel.js';
import Comments from '../models/commentModel.js';
import SeenPost from '../models/seenPostsModel.js';
import Notifications from '../models/notificationModel.js';
import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
//import Stripe from 'stripe';
//const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


// Configurare R2 (copiază din userProfiles dacă nu e deja partajat)
const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

function deleteFromR2(publicUrl) {
    if (!publicUrl || publicUrl.includes('gravatar') || !publicUrl.includes(process.env.R2_PUBLIC_DOMAIN)) return;
    try {
        const key = publicUrl.split('/').pop();
        const command = new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key });
        return r2.send(command);
    } catch (error) {
        console.error(`Eroare ștergere R2 (${publicUrl}):`, error);
    }
}


import Mailgun from 'mailgun.js';
import formData from "form-data";

const userRoute = Router();

// --- HELPER FUNCTIONS ---
const hashString = async (string) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(string, salt);
};

const compareString = async (string, hashedString) => {
    return await bcrypt.compare(string, hashedString);
}

const mailgun = new Mailgun(formData);
const client = mailgun.client({ username: 'api', key: process.env.MAILGUN_KEY, url: 'https://api.eu.mailgun.net' });

export async function sendMail({ to, subject, html }) {
    return client.messages.create(process.env.MAILGUN_DOMAIN, {
        from: `CarFlip.ro <no-reply@${process.env.MAILGUN_DOMAIN}>`,
        to,
        subject,
        html,
    });
}

import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';

// Conexiune separată pentru rate limiter (nu amesteca cu BullMQ)

const rateLimitRedis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 20,
    enableReadyCheck: true,
});

await rateLimitRedis.ping();
console.log('RateLimit Redis PING OK');

export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000 * 2,
    limit: 22,
    legacyHeaders: false,
    store: new RedisStore({
        sendCommand: (...args) => rateLimitRedis.call(...args),
        prefix: "r1:login:",
    }),
    message: "Prea multe incercari. Te rugam incearca mai tarziu."
});

export const fetchLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 4800,
    legacyHeaders: false,
    store: new RedisStore({
        sendCommand: (...args) => rateLimitRedis.call(...args),
        prefix: "r1:fetch:",
    }),
    message: "Prea multe incercari. Te rugam incearca mai tarziu."
});


// --- MIDDLEWARE ---
export const authUser = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) return res.status(401).json({ success: false, message: "Neautorizat" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { id: decoded.id };
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: "Token expirat" });
    }
};


// --- 1. REGISTER (TRIMITE OTP) ---
userRoute.post('/api/user/register',
    loginLimiter,
    checkSchema(userValidationSchema),
    async (req, res) => {
        const result = validationResult(req);
        if (!result.isEmpty())
            return res.json({ success: false, message: result.errors[0].msg, error: result.errors[0].msg });

        const { username, email, password } = req.body;
        const lowerEmail = email.trim().toLowerCase();
        if(!username || !email || !password)
            return res.json({success: false, message: "Campurile nu pot fi goale."});

        try {
            // 1. Verificăm unicitatea Username-ului PRIMA DATĂ, indiferent de email
            const existingUsername = await users.findOne({ username });
            if (existingUsername && existingUsername.email !== lowerEmail) {
                // Dacă username-ul e luat de ALT email, dăm reject clar
                if(existingUsername.isVerified)
                    return res.json({ success: false, message: "Numele de utilizator este deja folosit." });
                await users.findByIdAndDelete(existingUsername._id);
            }

            // 2. Verificăm starea email-ului
            let user = await users.findOne({ email: lowerEmail });

            if (user) {
                // FIX LEGACY: Orice nu este EXPLICIT false, înseamnă că e un cont valid/vechi și nu trebuie atins
                if (user.isVerified === true) {
                    return res.json({ success: false, message: "Acest email este deja asociat unui cont activ." });
                }
            }

            // 3. Generăm codul OTP de 6 cifre și calculăm expirarea (15 min)
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const hashedOtp = await hashString(otpCode);
            const hashedPassword = await hashString(password);
            const expirationTime = Date.now() + 15 * 60 * 1000;

            // 4. Creăm sau actualizăm utilizatorul (ca neverificat)
            if (user) {
                user.username = username;
                user.password = hashedPassword;
                user.verificationCode = hashedOtp;
                user.verificationExpires = expirationTime;
                await user.save();
            } else {
                user = await users.create({
                    username,
                    email: lowerEmail,
                    password: hashedPassword,
                    isVerified: false,
                    verificationCode: hashedOtp,
                    verificationExpires: expirationTime
                });
            }

            // 5. Trimitem email-ul
            const mailOptions = {
                to: lowerEmail,
                subject: "Codul tău de activare - CAR FLIP",
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                        <h2>Salut, ${username}!</h2>
                        <p>Îți mulțumim că te-ai înregistrat pe CAR FLIP.</p>
                        <p>Codul tău pentru activarea contului este:</p>
                        <h1 style="color: #800000; font-size: 32px; letter-spacing: 2px;">${otpCode}</h1>
                        <p>Introdu acest cod în aplicație pentru a finaliza înregistrarea.</p>
                        <p style="font-size: 12px; color: #666;">Acest cod expiră în 15 minute. Nu îl oferi nimănui.</p>
                    </div>
                `
            };

            await sendMail(mailOptions);
            return res.json({ success: true, message: "Codul de verificare a fost trimis pe mail." });

        } catch (er) {
            if (er.code === 11000){
                return res.json({success: false, message: "Numele de utilizator este deja folosit."});
            }
            console.error("Register Error:", er);
            return res.json({ success: false, message: "A apărut o eroare la înregistrare. Vă rugăm să încercați din nou mai târziu." });
        }
    }
);

// --- 2. VERIFY OTP (ACTIVEAZĂ CONTUL) ---
userRoute.post('/api/user/verify-otp',
    loginLimiter, // Foarte important: previne brute-forcing-ul codului de 6 cifre
    async (req, res) => {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.json({ success: false, message: "Emailul și codul sunt obligatorii." });
        }

        try {
            const user = await users.findOne({ email: email.trim().toLowerCase() });

            // Dacă userul nu există
            if (!user) {
                return res.json({ success: false, message: "Utilizatorul nu a fost găsit." });
            }

            // Dacă este deja verificat
            if (user.isVerified) {
                return res.json({ success: false, message: "Contul este deja activ. Te poți loga." });
            }

            // Dacă codul a expirat
            if (!user.verificationExpires || user.verificationExpires < Date.now()) {
                return res.json({ success: false, message: "Codul a expirat. Te rugăm să te înregistrezi din nou pentru a primi alt cod." });
            }

            // Verificăm dacă codul corespunde (folosim compareString pt că e hash-uit)
            const isMatch = await compareString(otp.toString(), user.verificationCode);

            if (!isMatch) {
                return res.json({ success: false, message: "Codul introdus este incorect." });
            }

            // Succes! Activăm contul și ștergem datele temporare de OTP
            user.isVerified = true;
            user.verificationCode = undefined;
            user.verificationExpires = undefined;
            await user.save();

            return res.json({ success: true, message: "Contul a fost activat cu succes! Te poți loga acum." });

        } catch (er) {
            console.error("Verify OTP Error:", er);
            return res.json({ success: false, message: "A apărut o eroare la verificare. Vă rugăm să încercați din nou mai târziu." });
        }
    }
);




// --- LOGIN (UPDATED FOR MULTI-DEVICE) ---
userRoute.post('/api/user/login',
    loginLimiter,
    async (req, res) => {
        // Primim și fcmToken acum
        const { email, password, fcmToken } = req.body;
        
        if (!email || !password)
            return res.json({ success: false, message: "Campurile nu pot fi goale." });
        
        try {
            const findUser = await users.findOne({ email: email.toLowerCase() });
            if (!findUser || !await compareString(password, findUser.password) || findUser.isVerified === false)
                return res.json({ success: false, message: "Email sau parola invalide." });
            if(findUser.isBanned === true)
                return res.json({success: false,  message: 'Contul a fost restrictionat.'})

            const newAccessToken = jwt.sign(
                { id: findUser._id, email: findUser.email },
                process.env.JWT_SECRET,
                { expiresIn: "20m" } // 20 min sau ceva
            );

            const newRefreshToken = jwt.sign(
                { id: findUser._id },
                process.env.JWT_REFRESH_SECRET,
                { expiresIn: "120d" }
            );

            // LOGICĂ NOUĂ: Salvăm un obiect { token, fcmToken }
            // $slice: -5 păstrează ultimele 5 sesiuni active
            await users.findByIdAndUpdate(findUser._id, {
                $push: {
                    refreshTokens: {
                        $each: [{ 
                            token: newRefreshToken, 
                            fcmToken: fcmToken || null // Dacă userul nu a dat allow, e null
                        }],
                        $slice: -5 
                    }
                }
            });

            return res.json({ 
                success: true, 
                message: "Autentificare realizată cu succes.", 
                newAccessToken, 
                newRefreshToken, 
                username: findUser.username 
            });

        } catch (er) {
            console.log(er);
            return res.json({ success: false, message: "A apărut o eroare. Vă rugăm să încercați din nou mai târziu." });
        }
    }
)

// --- REFRESH TOKEN (UPDATED FOR ROTATION + FCM PRESERVATION) ---
userRoute.post("/api/user/refresh",
    fetchLimiter,
    async (req, res) => {
        const { refreshToken: incomingToken } = req.body;

        if (!incomingToken)
            return res.status(403).json({ success: false });

        try {
            const decoded = jwt.verify(incomingToken, process.env.JWT_REFRESH_SECRET);
            const user = await users.findById(decoded.id);

            if (!user || user.isBanned) return res.status(403).json({ success: false, message: "Sesiune invalidă" });

            // Căutăm sesiunea specifică în array-ul de obiecte
            const sessionIndex = user.refreshTokens.findIndex(s => s.token === incomingToken);

            if (sessionIndex === -1) {
                // Token-ul nu există în baza de date (poate a fost deja rotit sau e fraudulos)
                user.refreshTokens = []; // Îl dăm afară de peste tot (Kill Switch)
                await user.save();
                return res.status(403).json({ success: false, message: "Sesiune invalidă" });
            }

            // Generăm noile token-uri
            const newAccessToken = jwt.sign(
                { id: user._id, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: "20m" }
            );

            const newRefreshToken = jwt.sign(
                { id: user._id },
                process.env.JWT_REFRESH_SECRET,
                { expiresIn: "120d" }
            );

            // ROTAȚIE: Actualizăm token-ul dar PĂSTRĂM fcmToken-ul existent!
            // Asta asigură continuitatea notificărilor.
            user.refreshTokens[sessionIndex].token = newRefreshToken;
            
            // MarkModified este necesar uneori când modificăm elemente din array direct
            user.markModified('refreshTokens');
            await user.save();

            return res.status(200).json({
                success: true,
                newAccessToken,
                newRefreshToken
            });

        } catch (err) {
            return res.status(403).json({ success: false, message: "Refresh token expirat" });
        }
    }
);

// --- LOGOUT (NOU) ---
userRoute.post('/api/user/logout', 
    fetchLimiter,
    async (req, res) => {
        const { refreshToken } = req.body;

        if (!refreshToken) return res.json({ success: false });

        try {
            // Ștergem sesiunea care are acest refresh token.
            // Automat dispare și FCM-ul asociat acelei sesiuni.
            await users.findOneAndUpdate(
                { "refreshTokens.token": refreshToken },
                { $pull: { refreshTokens: { token: refreshToken } } }
            );

            return res.json({ success: true, message: "Deconectat cu succes." });
        } catch (error) {
            console.error("Logout error:", error);
            return res.json({ success: false });
        }
    }
);

// =========================================================================
//                           FORGOT / RESET PASSWORD (OTP)
// =========================================================================

// --- 1. CERERE RESETARE PAROLĂ (TRIMITE OTP PE MAIL) ---
userRoute.post('/api/user/forgotpassword',
    loginLimiter,
    async (req, res) => {
        const { email } = req.body;
        if (!email) return res.json({ success: false, message: "Introdu adresa de email." });

        const lowerEmail = email.trim().toLowerCase();

        try {
            const user = await users.findOne({ email: lowerEmail });
            
            // SECURITATE: Prevenim "Email Enumeration" (Hackerii nu trebuie să afle dacă un email e înregistrat sau nu).
            // Dăm același mesaj de succes indiferent de rezultat.
            // Executăm logica DOAR dacă userul există și contul este verificat (isVerified !== false).
            if (user && user.isVerified !== false) {
                
                // 1. Generăm codul și setăm expirarea
                const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
                user.resetPasswordOtp = await hashString(otpCode);
                user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minute
                await user.save();

                // 2. Trimitem emailul
                await sendMail({
                    to: user.email,
                    subject: "Cod resetare parolă - CAR FLIP",
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                            <h2>Salut, ${user.username}!</h2>
                            <p>Ai solicitat resetarea parolei pentru contul tău CAR FLIP.</p>
                            <p>Codul tău de resetare este:</p>
                            <h1 style="color: #800000; font-size: 32px; letter-spacing: 4px;">${otpCode}</h1>
                            <p>Introdu acest cod în aplicație pentru a seta o nouă parolă.</p>
                            <p style="font-size: 12px; color: #666;">Acest cod expiră în 15 minute. Dacă nu ai cerut tu resetarea, poți ignora acest mesaj.</p>
                        </div>
                    `
                });
            }

            // Returnăm succes instantaneu, chiar dacă mailul nu există în DB.
            return res.json({ success: true, message: "Vei primi un cod pe email. Verifica inbox-ul" });

        } catch (er) {
            console.error("Forgot Pass Error:", er);
            return res.json({ success: false, message: "A apărut o eroare la trimiterea mailului. Încearcă mai târziu." });
        }
    }
);

// --- 2. SCHIMBARE EFECTIVĂ A PAROLEI (VERIFICĂ OTP + SALVEAZĂ PAROLA) ---
userRoute.post('/api/user/reset-password',
    loginLimiter, // Esențial pentru a preveni ghicirea codului de 6 cifre
    async (req, res) => {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.json({ success: false, message: "Toate câmpurile sunt obligatorii." });
        }

        if (newPassword.length < 8 || newPassword.length > 32) {
            return res.json({ success: false, message: "Noua parolă trebuie să conțină între 8 și 32 de caractere." });
        }

        const lowerEmail = email.trim().toLowerCase();

        try {
            const user = await users.findOne({ email: lowerEmail });

            if (!user) {
                return res.json({ success: false, message: "Date incorecte sau cod expirat." });
            }

            // 1. Verificăm dacă a expirat codul
            if (!user.resetPasswordOtp || !user.resetPasswordExpires || user.resetPasswordExpires < Date.now()) {
                return res.json({ success: false, message: "Codul a expirat sau este invalid. Te rugăm să ceri altul." });
            }

            // 3. Verificăm validitatea codului OTP
            const isMatch = await compareString(otp.toString(), user.resetPasswordOtp);
            if (!isMatch) {
                return res.json({ success: false, message: "Codul introdus este incorect." });
            }

            // 2. Verificăm dacă parola e cumva la fel ca aia veche (Nice-to-have security check)
            const isSamePassword = await compareString(newPassword, user.password);
            if (isSamePassword) {
                return res.json({ success: false, message: "Noua parolă nu poate fi identică cu cea veche." });
            }

            // 4. TOTUL E PERFECT! Schimbăm parola
            user.password = await hashString(newPassword);
            
            // 5. Curățăm datele temporare OTP
            user.resetPasswordOtp = undefined;
            user.resetPasswordExpires = undefined;

            // 6. KILL SWITCH (Delogăm userul de peste tot)
            // Când va schimba parola din "Setări", acest pas îl va forța pe aplicația de React Native 
            // să dea fail la Axios Interceptor, delogându-l automat din interfață.
            user.refreshTokens = []; 
            
            await user.save();

            return res.json({ success: true, message: "Parola a fost schimbată cu succes! Te poți loga acum." });

        } catch (er) {
            console.error("Reset Pass Error:", er);
            return res.json({ success: false, message: "A apărut o eroare la resetarea parolei. Încearcă mai târziu." });
        }
    }
);

// --- USER DATA ---
userRoute.get('/api/user/data',
    authUser,
    fetchLimiter, 
    async (req, res) => {
        try {
            const findUser = await users.findById(req.user.id)
            if (!findUser)
                return res.json({ success: false });
            const { username, email } = findUser;
            return res.json({ success: true, message: "Am gasit userul cu succes.", username, email })
        } catch (er) {
            return res.json({ success: false, message: "Eroare la gasirea userului." });
        }
    }
)

userRoute.put('/api/user/change-password',
    authUser,
    loginLimiter,
    async (req, res) => {
        try {
            const { currentPassword, newPassword, confirmPassword, refreshToken } = req.body;

            if (!currentPassword || !newPassword || !confirmPassword) {
                return res.status(400).json({ success: false, message: "Toate câmpurile sunt obligatorii." });
            }

            if (newPassword !== confirmPassword) {
                return res.status(400).json({ success: false, message: "Parolele noi nu coincid." });
            }

            if (newPassword.length < 8 || newPassword.length > 32) {
                return res.status(400).json({ success: false, message: "Parola trebuie să aibă între 8 și 32 de caractere." });
            }

            const user = await users.findById(req.user.id);
            if (!user) return res.status(404).json({ success: false, message: "Utilizator negăsit." });

            // Verificăm parola curentă
            const isMatch = await compareString(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ success: false, message: "Parola curentă este incorectă." });
            }

            // Verificăm să nu fie identică cu cea veche
            const isSame = await compareString(newPassword, user.password);
            if (isSame) {
                return res.status(400).json({ success: false, message: "Noua parolă nu poate fi identică cu cea actuală." });
            }

            // Hash + salvare
            user.password = await hashString(newPassword);

            // Păstrăm DOAR sesiunea curentă, restul le invalidăm
            if (refreshToken) {
                user.refreshTokens = user.refreshTokens.filter(s => s.token === refreshToken);
            } else {
                // Dacă din orice motiv nu avem refreshToken, ștergem tot (fallback safe)
                user.refreshTokens = [];
            }

            user.markModified('refreshTokens');
            await user.save();

            return res.json({ success: true, message: "Parola a fost schimbată cu succes." });

        } catch (error) {
            console.error("Change Password Error:", error);
            return res.status(500).json({ success: false, message: "Eroare la schimbarea parolei." });
        }
    }
);



userRoute.delete('/api/user/delete-account',
    authUser,
    loginLimiter,
    async (req, res) => {
        try {
            const { password } = req.body;

            if (!password) {
                return res.status(400).json({ success: false, message: "Parola este necesară pentru confirmare." });
            }

            const user = await users.findById(req.user.id);
            if (!user) return res.status(404).json({ success: false, message: "Utilizator negăsit." });

            // Verificare parolă
            const isMatch = await compareString(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ success: false, message: "Parola este incorectă." });
            }

            const userId = req.user.id;

            // ──────────────────────────────────────────────
            // 1. SALES: Stripe cancel + R2 cleanup + delete
            // ──────────────────────────────────────────────
            const userSales = await sales.find({ user_id: userId });
            const saleIds = userSales.map(s => s._id);

            for (const sale of userSales) {
                /*if (sale.stripe_subscription_id) {
                    try {
                        await stripe.subscriptions.cancel(sale.stripe_subscription_id);
                    } catch (err) {
                        console.warn(`[Delete] Stripe skip (${sale.stripe_subscription_id}):`, err.message);
                    }
                }*/

                if (sale.media && sale.media.length > 0) {
                    for (const file of sale.media) {
                        if (file.public_id) {
                            try {
                                await r2.send(new DeleteObjectCommand({
                                    Bucket: process.env.R2_BUCKET_NAME,
                                    Key: file.public_id
                                }));
                            } catch (err) {
                                console.warn(`[Delete] R2 media skip (${file.public_id}):`, err.message);
                            }
                        }
                    }
                }
            }

            await sales.deleteMany({ user_id: userId });

            // ──────────────────────────────────────────────
            // 2. COMMENTS
            // ──────────────────────────────────────────────
            await Comments.deleteMany({
                $or: [
                    { user_id: userId },
                    { sale_id: { $in: saleIds } }
                ]
            });

            // ──────────────────────────────────────────────
            // 3. SEEN POSTS
            // ──────────────────────────────────────────────
            await SeenPost.deleteMany({
                $or: [
                    { user_id: userId },
                    { sale_id: { $in: saleIds } }
                ]
            });

            // ──────────────────────────────────────────────
            // 4. NOTIFICATIONS
            // ──────────────────────────────────────────────
            await Notifications.deleteMany({
                $or: [
                    { user_id: userId },
                    { sender_id: userId }
                ]
            });

            // ──────────────────────────────────────────────
            // 5. MESSAGES: Ștergem imaginile din R2 + mesajele
            // ──────────────────────────────────────────────
            const imageMessages = await Message.find({ sender_id: userId, type: 'image' });

            for (const msg of imageMessages) {
                if (msg.image_public_id) {
                    try {
                        await r2.send(new DeleteObjectCommand({
                            Bucket: process.env.R2_BUCKET_NAME,
                            Key: msg.image_public_id
                        }));
                    } catch (err) {
                        console.warn(`[Delete] R2 msg skip (${msg.image_public_id}):`, err.message);
                    }
                }
            }

            await Message.deleteMany({ sender_id: userId });

            // ──────────────────────────────────────────────
            // 6. CONVERSATIONS + mesajele rămase din ele
            // ──────────────────────────────────────────────
            const userConversations = await Conversation.find({ participants: userId });
            const conversationIds = userConversations.map(c => c._id);

            await Message.deleteMany({ conversation_id: { $in: conversationIds } });
            await Conversation.deleteMany({ _id: { $in: conversationIds } });

            // ──────────────────────────────────────────────
            // 7. AVATAR din R2
            // ──────────────────────────────────────────────
            await deleteFromR2(user.icon);

            // ──────────────────────────────────────────────
            // 8. BLOCKING/BLOCKED_BY: Curățăm listele altora
            // ──────────────────────────────────────────────
            await users.updateMany(
                { blocking: userId },
                { $pull: { blocking: userId } }
            );
            await users.updateMany(
                { blocked_by: userId },
                { $pull: { blocked_by: userId } }
            );

            // ──────────────────────────────────────────────
            // 9. LIKED_BY pe sales-urile altora
            // ──────────────────────────────────────────────
            await sales.updateMany(
                { "liked_by.user_id": userId },
                {
                    $pull: { liked_by: { user_id: userId } },
                    $inc: { likes_count: -1 }
                }
            );

            // ──────────────────────────────────────────────
            // 10. LIKED_BY pe comentariile altora
            // ──────────────────────────────────────────────
            await Comments.updateMany(
                { liked_by: userId },
                {
                    $pull: { liked_by: userId },
                    $inc: { likes_count: -1 }
                }
            );

            // ──────────────────────────────────────────────
            // 11. Ștergem userul
            // ──────────────────────────────────────────────
            await users.findByIdAndDelete(userId);

            return res.json({ success: true, message: "Contul și toate datele asociate au fost șterse definitiv." });

        } catch (error) {
            console.error("Delete Account Error:", error);
            return res.status(500).json({ success: false, message: "Eroare la ștergerea contului." });
        }
    }
);

export default userRoute;