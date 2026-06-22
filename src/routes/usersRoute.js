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
import { OAuth2Client } from 'google-auth-library';
//import Stripe from 'stripe';
//const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
import appleSignin from 'apple-signin-auth';


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

const googleClient = new OAuth2Client();
const APPLE_AUDIENCE = process.env.APPLE_BUNDLE_ID || 'ro.carflip.app';

// Generează un username unic din email/nume, cu sufix random.
const generateGoogleUsername = async (base) => {
    let clean = (base || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
    if (clean.length < 3) clean = 'user';

    for (let i = 0; i < 5; i++) {
        const candidate = `${clean}${Math.floor(1000 + Math.random() * 9000)}`;
        const taken = await users.findOne({ username: candidate }).select('_id').lean();
        if (!taken) return candidate;
    }
    return `${clean}${Date.now().toString().slice(-6)}`;
};

// Create-or-login + linking sigur. Întoarce documentul user.
const resolveGoogleUser = async ({ googleId, email, name, picture }) => {
    // A. Întâi pe googleId (identificator stabil) → user care revine.
    let user = await users.findOne({ googleId });
    if (user) return user;

    // B. Pe email → linking cu un cont existent.
    user = await users.findOne({ email });
    if (user) {
        if (user.isVerified === true) {
            // Cont verificat: deținerea inboxului a fost dovedită cândva prin OTP.
            // Google confirmă același inbox → aceeași persoană. Atașăm googleId.
            user.googleId = googleId;
            if (picture && (!user.icon || user.icon.includes('gravatar'))) {
                user.icon = picture;
            }
        } else {
            // Cont local NEVERIFICAT: nimeni n-a dovedit emailul pe ruta locală.
            // Google l-a dovedit → preluăm în siguranță, ștergem parola/OTP neprobate.
            user.googleId = googleId;
            user.isVerified = true;
            user.password = undefined;
            user.verificationCode = undefined;
            user.verificationExpires = undefined;
            if (picture) user.icon = picture;
        }
        await user.save();
        return user;
    }

    // C. Cont nou — cu retry pe coliziunea (foarte rară) de username.
    for (let attempt = 0; attempt < 3; attempt++) {
        const username = await generateGoogleUsername(email.split('@')[0] || name);
        try {
            return await users.create({
                username, email, googleId,
                isVerified: true,
                icon: picture || undefined,
            });
        } catch (err) {
            if (err.code === 11000) {
                // dublu-tap real pe același user → ia-l pe cel creat între timp
                const existing = await users.findOne({ $or: [{ googleId }, { email }] });
                if (existing) return existing;
                // altfel a fost doar coliziune de username → reîncearcă cu altul
                if (err.keyPattern?.username) continue;
            }
            throw err;
        }
    }
    throw new Error('Nu s-a putut genera un username unic.');
};

// Construiește numele din fullName-ul Apple (vine doar la primul sign-in).
const buildAppleName = (fullName) => {
    if (!fullName) return '';
    if (typeof fullName === 'string') return fullName.trim();
    const parts = [fullName.givenName, fullName.familyName].filter(Boolean);
    return parts.join(' ').trim();
};

// Create-or-login + linking sigur pentru Apple. Întoarce documentul user.
const resolveAppleUser = async ({ appleId, email, name }) => {
    // A. Întâi pe appleId (identificator stabil) → user care revine.
    let user = await users.findOne({ appleId });
    if (user) return user;

    // B. Pe email → linking cu un cont existent (doar dacă avem email).
    if (email) {
        user = await users.findOne({ email });
        if (user) {
            if (user.isVerified === true) {
                user.appleId = appleId;
            } else {
                user.appleId = appleId;
                user.isVerified = true;
                user.password = undefined;
                user.verificationCode = undefined;
                user.verificationExpires = undefined;
            }
            await user.save();
            return user;
        }
    }

    // C. Cont nou. Apple fără email la cont nou = nu putem crea (email obligatoriu).
    if (!email) throw new Error('NO_EMAIL_NEW_USER');

    for (let attempt = 0; attempt < 3; attempt++) {
        const username = await generateGoogleUsername(email.split('@')[0] || name);
        try {
            return await users.create({
                username, email, appleId,
                isVerified: true,
            });
        } catch (err) {
            if (err.code === 11000) {
                const existing = await users.findOne({ $or: [{ appleId }, { email }] });
                if (existing) return existing;
                if (err.keyPattern?.username) continue;
            }
            throw err;
        }
    }
    throw new Error('Nu s-a putut genera un username unic.');
};

// =========================================================================
//   APPLE — REVOCARE TOKEN (necesară la ștergerea contului pentru App Store)
// -------------------------------------------------------------------------
//   Toate funcțiile de mai jos sunt BEST-EFFORT: nu aruncă niciodată, deci
//   dacă env-urile lipsesc sau Apple dă eroare, login-ul/ștergerea merg
//   normal, doar se loghează un warning. Revocarea se "armează" automat în
//   momentul în care pui APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY.
// =========================================================================

// Avem tot ce trebuie ca să vorbim cu API-ul REST Apple? (env-uri din cheia .p8)
const APPLE_REVOKE_READY = !!(
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_KEY_ID &&
    process.env.APPLE_PRIVATE_KEY
);

// Client secret-ul Apple = un JWT semnat cu cheia .p8. Îl regenerăm la fiecare
// apel (e ieftin) ca să nu ținem un secret expirat în memorie.
const getAppleClientSecret = () => appleSignin.getClientSecret({
    clientID: APPLE_AUDIENCE,                                          // Bundle ID-ul (flux nativ iOS)
    teamID: process.env.APPLE_TEAM_ID,                                // Team ID
    keyIdentifier: process.env.APPLE_KEY_ID,                          // Key ID-ul cheii .p8
    privateKey: (process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'), // conținutul .p8
    expAfter: 300,                                                    // valabil 5 min, cât să facă apelul
});

// Schimbă authorizationCode pe un refresh token Apple și-l salvează pe user.
// Best-effort: dacă pică, login-ul Apple NU e afectat.
const storeAppleRefreshToken = async (userId, authorizationCode) => {
    if (!APPLE_REVOKE_READY || !authorizationCode) return;
    try {
        const clientSecret = getAppleClientSecret();
        // Flux nativ → fără redirectUri (query-string sare valorile undefined).
        const tokenResponse = await appleSignin.getAuthorizationToken(authorizationCode, {
            clientID: APPLE_AUDIENCE,
            clientSecret,
        });
        if (tokenResponse?.refresh_token) {
            await users.findByIdAndUpdate(userId, { appleRefreshToken: tokenResponse.refresh_token });
        }
    } catch (e) {
        console.warn('Apple token exchange skip:', e?.message);
    }
};

// Revocă refresh token-ul Apple. Best-effort: nu aruncă niciodată.
const revokeAppleToken = async (refreshToken) => {
    if (!APPLE_REVOKE_READY || !refreshToken) return;
    try {
        const clientSecret = getAppleClientSecret();
        await appleSignin.revokeAuthorizationToken(refreshToken, {
            clientID: APPLE_AUDIENCE,
            clientSecret,
            tokenTypeHint: 'refresh_token',
        });
    } catch (e) {
        console.warn('Apple revoke skip:', e?.message);
    }
};

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
                if (user.isVerified === true) {
                    // Dacă e cont OAuth (fără parolă), trimitem userul spre butonul corect.
                    if (user.googleId && !user.password) {
                        return res.json({ success: false, message: "Acest email folosește autentificare Google. Conectează-te cu butonul Google." });
                    }
                    if (user.appleId && !user.password) {
                        return res.json({ success: false, message: "Acest email folosește autentificare Apple. Conectează-te cu butonul Apple." });
                    }
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
    loginLimiter,
    async (req, res) => {
        const { email, otp, fcmToken } = req.body; // ← primim și fcmToken

        if (!email || !otp) {
            return res.json({ success: false, message: "Emailul și codul sunt obligatorii." });
        }

        try {
            const user = await users.findOne({ email: email.trim().toLowerCase() });

            if (!user) {
                return res.json({ success: false, message: "Utilizatorul nu a fost găsit." });
            }
            if (user.isVerified) {
                return res.json({ success: false, message: "Contul este deja activ. Te poți loga." });
            }
            if (!user.verificationExpires || user.verificationExpires < Date.now()) {
                return res.json({ success: false, message: "Codul a expirat. Te rugăm să te înregistrezi din nou pentru a primi alt cod." });
            }

            const isMatch = await compareString(otp.toString(), user.verificationCode);
            if (!isMatch) {
                return res.json({ success: false, message: "Codul introdus este incorect." });
            }

            // --- Activăm contul ---
            user.isVerified = true;
            user.verificationCode = undefined;
            user.verificationExpires = undefined;

            // --- Generăm tokenii, exact ca la login ---
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

            // --- Creăm sesiunea (păstrăm ultimele 5) ---
            user.refreshTokens.push({ token: newRefreshToken, fcmToken: fcmToken || null });
            if (user.refreshTokens.length > 5) {
                user.refreshTokens = user.refreshTokens.slice(-5);
            }

            await user.save(); // un singur save: activare + sesiune

            return res.json({
                success: true,
                message: "Contul a fost activat cu succes!",
                newAccessToken,
                newRefreshToken,
                username: user.username
            });

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
            // Conturile OAuth (fără parolă) NU se pot loga pe email+parolă.
            // `!findUser.password` taie scurt înainte de compareString (care ar arunca pe hash undefined).
            if (!findUser || !findUser.password || !await compareString(password, findUser.password) || findUser.isVerified === false)
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


userRoute.post('/api/user/google-auth',
    loginLimiter,
    async (req, res) => {
        const { idToken, fcmToken } = req.body;
        if (!idToken) return res.json({ success: false, message: "Token lipsă." });

        try {
            // 1. Verificăm token-ul cu Google (semnătură + aud + iss + exp).
            let payload;
            try {
                const ticket = await googleClient.verifyIdToken({
                    idToken,
                    audience: process.env.GOOGLE_WEB_CLIENT_ID,
                });
                payload = ticket.getPayload();
            } catch (verifyErr) {
                console.warn("Google token invalid:", verifyErr.message);
                return res.json({ success: false, message: "Autentificare Google invalidă." });
            }

            // 2. Datele de încredere din token.
            const googleId = payload.sub;
            const email = (payload.email || '').trim().toLowerCase();
            const name = payload.name || '';
            const picture = payload.picture || null;

            if (!googleId || !email)
                return res.json({ success: false, message: "Cont Google incomplet." });
            // 3. Emailul TREBUIE verificat de Google.
            if (payload.email_verified !== true)
                return res.json({ success: false, message: "Emailul Google nu este verificat." });

            // 4. Create-or-login + linking.
            const user = await resolveGoogleUser({ googleId, email, name, picture });

            // 5. Cont banat → stop.
            if (user.isBanned === true)
                return res.json({ success: false, message: "Contul a fost restricționat." });

            // 6. Tokeni IDENTICI cu login-ul normal.
            const newAccessToken = jwt.sign(
                { id: user._id, email: user.email },
                process.env.JWT_SECRET, { expiresIn: "20m" }
            );
            const newRefreshToken = jwt.sign(
                { id: user._id },
                process.env.JWT_REFRESH_SECRET, { expiresIn: "120d" }
            );

            // 7. Sesiune cu fcmToken, păstrăm ultimele 5 (exact ca la login).
            await users.findByIdAndUpdate(user._id, {
                $push: {
                    refreshTokens: {
                        $each: [{ token: newRefreshToken, fcmToken: fcmToken || null }],
                        $slice: -5
                    }
                }
            });

            return res.json({
                success: true,
                message: "Autentificare reușită.",
                newAccessToken, newRefreshToken,
                username: user.username
            });

        } catch (er) {
            console.error("Google Auth Error:", er);
            return res.json({ success: false, message: "A apărut o eroare. Încearcă mai târziu." });
        }
    }
);

userRoute.post('/api/user/apple-auth',
    loginLimiter,
    async (req, res) => {
        const { identityToken, fullName, authorizationCode, fcmToken } = req.body;
        if (!identityToken) return res.json({ success: false, message: "Token lipsă." });

        try {
            // 1. Verificăm token-ul cu Apple (semnătură + aud + iss + exp).
            let payload;
            try {
                payload = await appleSignin.verifyIdToken(identityToken, {
                    audience: APPLE_AUDIENCE,
                });
            } catch (verifyErr) {
                console.warn("Apple token invalid:", verifyErr.message);
                return res.json({ success: false, message: "Autentificare Apple invalidă." });
            }

            // 2. Datele de încredere din token.
            const appleId = payload.sub;
            const email = (payload.email || '').trim().toLowerCase() || null;
            const emailVerified = payload.email_verified === true || payload.email_verified === 'true';

            if (!appleId)
                return res.json({ success: false, message: "Cont Apple incomplet." });
            // 3. Dacă avem email, TREBUIE verificat de Apple.
            if (email && !emailVerified)
                return res.json({ success: false, message: "Emailul Apple nu este verificat." });

            const name = buildAppleName(fullName);

            // 4. Create-or-login + linking.
            let user;
            try {
                user = await resolveAppleUser({ appleId, email, name });
            } catch (resolveErr) {
                // Apple nu mai trimite emailul la re-autorizare (ex: cont șters server-side apoi re-login).
                // Retry-ul nu ajută — userul trebuie să revoce app-ul din setările Apple ID.
                if (resolveErr.message === 'NO_EMAIL_NEW_USER')
                    return res.json({ success: false, message: "Apple nu a trimis adresa de email. Mergi în Setări → (numele tău) → Conectare și securitate → Aplicații care folosesc Apple ID → CarFlip → Oprește utilizarea, apoi încearcă din nou." });
                throw resolveErr;
            }

            // 5. Cont banat → stop.
            if (user.isBanned === true)
                return res.json({ success: false, message: "Contul a fost restricționat." });

            // 6. Tokeni IDENTICI cu login-ul normal.
            const newAccessToken = jwt.sign(
                { id: user._id, email: user.email },
                process.env.JWT_SECRET, { expiresIn: "20m" }
            );
            const newRefreshToken = jwt.sign(
                { id: user._id },
                process.env.JWT_REFRESH_SECRET, { expiresIn: "120d" }
            );

            // 7. Sesiune cu fcmToken, păstrăm ultimele 5 (exact ca la login).
            await users.findByIdAndUpdate(user._id, {
                $push: {
                    refreshTokens: {
                        $each: [{ token: newRefreshToken, fcmToken: fcmToken || null }],
                        $slice: -5
                    }
                }
            });

            // 8. (Revocare) Schimbăm authorizationCode pe un refresh token Apple și-l salvăm.
            //    Best-effort: dacă pică, nu afectează login-ul de mai sus.
            await storeAppleRefreshToken(user._id, authorizationCode);

            return res.json({
                success: true,
                message: "Autentificare reușită.",
                newAccessToken, newRefreshToken,
                username: user.username
            });

        } catch (er) {
            console.error("Apple Auth Error:", er);
            return res.json({ success: false, message: "A apărut o eroare. Încearcă mai târziu." });
        }
    }
);

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

            // 2. Verificăm dacă parola e cumva la fel ca aia veche — DOAR dacă userul are deja parolă.
            // (Conturile OAuth fără parolă își setează prima parolă aici; compareString pe hash undefined ar arunca.)
            if (user.password) {
                const isSamePassword = await compareString(newPassword, user.password);
                if (isSamePassword) {
                    return res.json({ success: false, message: "Noua parolă nu poate fi identică cu cea veche." });
                }
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
            const { username, email, metaData } = findUser;
            return res.json({ 
                success: true, 
                message: "Am gasit userul cu succes.", 
                username, 
                email,
                hasPassword: !!findUser.password, // frontend-ul știe dacă e cont cu parolă sau OAuth
                preferredCounty: metaData?.preferredCounty || null
            })
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

            // currentPassword e cerut doar pentru conturile care AU parolă (mai jos).
            if (!newPassword || !confirmPassword) {
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

            // Conturile CU parolă: verificăm parola curentă + să nu fie identică.
            // Conturile OAuth (fără parolă) ajung aici doar dacă își setează prima parolă → sărim verificarea.
            if (user.password) {
                if (!currentPassword) {
                    return res.status(400).json({ success: false, message: "Parola curentă este obligatorie." });
                }
                const isMatch = await compareString(currentPassword, user.password);
                if (!isMatch) {
                    return res.status(400).json({ success: false, message: "Parola curentă este incorectă." });
                }
                const isSame = await compareString(newPassword, user.password);
                if (isSame) {
                    return res.status(400).json({ success: false, message: "Noua parolă nu poate fi identică cu cea actuală." });
                }
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

            const user = await users.findById(req.user.id);
            if (!user) return res.status(404).json({ success: false, message: "Utilizator negăsit." });

            // Conturile OAuth (Apple/Google) n-au parolă → confirmarea prin parolă nu se aplică.
            // Userul e deja autentificat prin access token (authUser) = dovadă suficientă de identitate.
            // (Obligatoriu pentru App Store: userii Apple TREBUIE să-și poată șterge contul.)
            if (user.password) {
                if (!password) {
                    return res.status(400).json({ success: false, message: "Parola este necesară pentru confirmare." });
                }
                const isMatch = await compareString(password, user.password);
                if (!isMatch) {
                    return res.status(400).json({ success: false, message: "Parola este incorectă." });
                }
            }

            const userId = req.user.id;

            // ──────────────────────────────────────────────
            // 0. APPLE: revocăm token-ul (best-effort) înainte de a șterge orice.
            //    Cerință Apple pentru Sign in with Apple la ștergerea contului.
            // ──────────────────────────────────────────────
            await revokeAppleToken(user.appleRefreshToken);

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

// ============================================================================
//  PUT /api/user/preferred-county  —  salvează / șterge județul preferat
// ----------------------------------------------------------------------------
//  Se adaugă în usersRoute.js, pe ACELAȘI router pe care e definit
//  /api/user/data. Mai jos router-ul e numit `router` — înlocuiește-l cu
//  numele real al router-ului din fișierul tău (cel pe care faci .get/.post).
//
//  Body:
//    { "county": "Cluj" }            → setează județul preferat
//    { "county": null } / "" / lipsă → șterge preferința (revine la feed normal)
//
//  • Salvează în metaData.preferredCounty cu $set dot-notation → NU atinge
//    alte chei din metaData.
//  • La ștergere folosește $unset → nu lasă o cheie null în urmă.
//  • Fără whitelist de județe: backend-ul nu ține lista de județe (e în
//    staticData.js, pe frontend), iar ruta de postare oricum nu validează.
//    Dacă s-ar salva un județ inexistent, Tier A din feed e pur și simplu
//    gol, iar feed-ul degradează curat la varianta normală. Length cap-ul
//    de 100 caractere previne abuzul de stocare.
//
//  Ruta de feed (/api/sales/feed) citește metaData.preferredCounty:
//    setat   → feed prioritizat pe județ
//    absent  → feed identic cu cel de azi
// ============================================================================

userRoute.put('/api/user/preferred-county', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        if (!userId)
            return res.json({ success: false, message: "Sesiune expirata" });

        const raw = req.body ? req.body.county : null;

        // Normalizare: string ne-gol și rezonabil ca lungime → îl păstrăm.
        // Orice altceva (null, "", non-string, prea lung) → preferință ștearsă.
        let countyValue = null;
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (trimmed.length > 0 && trimmed.length <= 100) {
                countyValue = trimmed;
            }
        }

        // Setăm sau ștergem, fără să atingem restul lui metaData.
        const update = countyValue !== null
            ? { $set:   { 'metaData.preferredCounty': countyValue } }
            : { $unset: { 'metaData.preferredCounty': '' } };

        const updated = await users.findByIdAndUpdate(userId, update, { new: true })
            .select('_id');

        if (!updated)
            return res.json({ success: false, message: "Utilizator inexistent." });

        // countyValue: string = județul setat,  null = preferința a fost ștearsă.
        return res.json({
            success: true,
            preferredCounty: countyValue
        });

    } catch (error) {
        console.error("Preferred County Error:", error);
        return res.status(500).json({ success: false, message: "Eroare la salvarea județului." });
    }
});

export default userRoute;