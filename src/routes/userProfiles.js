import { Router } from "express";
import users from "../models/userModel.js";
import { authUser, fetchLimiter } from "./usersRoute.js";
import sales from "../models/salesModel.js";
import mongoose from "mongoose";

import multer from 'multer';
import path from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';


const userProfiles = Router();


// --- CONFIGURARE S3 / CLOUDFLARE R2 & MULTER ---
const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Doar imagini sunt permise!'), false);
    }
};
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: fileFilter });

async function uploadToR2(file) {
    // Generăm un nume unic pentru fișier
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    
    // --- MAGIA SHARP: Redimensionare și tăiere pătrată 200x200 ---
    const resizedBuffer = await sharp(file.buffer)
        .resize(200, 200, {
            fit: 'cover', // Taie marginile în exces pentru a păstra proporțiile
            position: 'center' // Centrează tăietura pe mijlocul pozei
        })
        .jpeg({ quality: 90 }) // Opțional: forțează salvarea optimizată (salvează spațiu pe R2)
        .toBuffer();

    const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: uniqueName,
        Body: resizedBuffer, // <--- Folosim noul buffer micșorat
        ContentType: file.mimetype,
    });
    
    await r2.send(command);
    return `${process.env.R2_PUBLIC_DOMAIN}/${uniqueName}`;
}

async function deleteFromR2(publicUrl) {
    if (!publicUrl || publicUrl.includes('gravatar') || !publicUrl.includes(process.env.R2_PUBLIC_DOMAIN)) return;
    try {
        const key = publicUrl.split('/').pop(); 
        const command = new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key });
        await r2.send(command);
    } catch (error) {
        console.error(`Eroare ștergere R2 (${publicUrl}):`, error);
    }
}


const DEFAULT_AVATAR = "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";

const uploadAvatar = (req, res, next) => {
    upload.single('avatar')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ success: false, message: "Imaginea este prea mare. Limita este de 10MB." });
            }
            return res.status(400).json({ success: false, message: err.message || "Fișier invalid." });
        }
        next();
    });
};



const sanitize = (text) => text ? String(text).trim() : "";
// -----------------------------------------------



// --- 1. GET: Obține profilul curent ---
userProfiles.get('/api/user/me', authUser, fetchLimiter, async (req, res) => {
    try {
        const user = await users.findById(req.user.id).select('username email icon metaData');
        if (!user) return res.status(404).json({ success: false, message: 'Utilizator negăsit.' });
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});

userProfiles.get('/api/user/my-posts', authUser, fetchLimiter, async (req, res) => {
    try {
        const { type, cursor } = req.query; 
        const limit = parseInt(req.query.limit) || 20;
        const currentUserId = req.user.id;
        let query = {};

        // Cazurile "Active" și "Grace" rămân pe logica veche (Find simplu)
        if (type === 'active' || type === 'grace') {
            if (type === 'active') {
                query = { user_id: currentUserId, is_active: true };
            } else {
                query = { user_id: currentUserId, is_active: false, status: 'grace_period' };
            }
        

            if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
                query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
            }

            const userPosts = await sales.find(query)
                .sort({ _id: -1 })
                .limit(limit)
                .populate('user_id', 'username icon');

            const postsWithLikeStatus = userPosts.map(doc => {
                const postObj = doc.toObject({ getters: true, virtuals: true });
                const likedByStrings = postObj.liked_by ? postObj.liked_by.map(like => like.user_id.toString()) : [];
                delete postObj.liked_by;
                return {
                    ...postObj,
                    hasLiked: likedByStrings.includes(currentUserId)
                };
            });

            let nextCursor = null;
            if (userPosts.length === limit) {
                nextCursor = userPosts[userPosts.length - 1]._id;
            }

            return res.json({ 
                success: true, 
                data: postsWithLikeStatus,
                nextCursor
            });
        } 
        
        // Cazul "Liked" - Folosim Aggregation pentru a sorta după data like-ului
        else if (type === 'liked') {
            const pipeline = [];
            const userObjectId = new mongoose.Types.ObjectId(currentUserId);

            // 1. Filtrăm doar anunțurile active care au primit like de la userul nostru
            pipeline.push({ 
                $match: { 
                    is_active: true, 
                    "liked_by.user_id": userObjectId 
                } 
            });

            // 2. Adăugăm un câmp temporar 'my_like_date' extrăgând data like-ului dat de utilizatorul curent
            pipeline.push({
                $addFields: {
                    my_like_date: {
                        $let: {
                            vars: {
                                myLikeObj: {
                                    $arrayElemAt: [
                                        { $filter: { input: "$liked_by", as: "like", cond: { $eq: ["$$like.user_id", userObjectId] } } },
                                        0
                                    ]
                                }
                            },
                            in: "$$myLikeObj.liked_at"
                        }
                    }
                }
            });

            // 3. Paginare cu Cursor (bazat pe data like-ului)
            if (cursor) {
                const cursorDate = new Date(Number(cursor)); // Cursorul va fi un timestamp
                pipeline.push({
                    $match: { my_like_date: { $lt: cursorDate } }
                });
            }

            // 4. Sortăm descrescător după data like-ului
            pipeline.push({ $sort: { my_like_date: -1 } });
            
            // 5. Limităm rezultatele
            pipeline.push({ $limit: limit });

            // Executăm agregarea
            const userPosts = await sales.aggregate(pipeline);

            // 6. Populăm informațiile userului care a creat anunțul (deoarece aggregate nu suportă .populate direct pe modelul ref)
            await sales.populate(userPosts, { path: 'user_id', select: 'username icon' });

            let nextCursor = null;
            if (userPosts.length === limit) {
                // Returnăm timestamp-ul ultimului like ca noul cursor
                nextCursor = userPosts[userPosts.length - 1].my_like_date.getTime(); 
            }

            const postsWithLikeStatus = userPosts.map(post => {
                delete post.liked_by;
                delete post.my_like_date;
                return {
                    ...post,
                    hasLiked: true
                };
            });

            return res.json({ 
                success: true, 
                data: postsWithLikeStatus,
                nextCursor
            });
        } 
        
        else {
            return res.status(400).json({ success: false, message: "Tip de listă invalid." });
        }

    } catch (error) {
        console.error("Eroare la my-posts:", error);
        return res.status(500).json({ success: false, message: "Eroare la încărcarea anunțurilor." });
    }
});



// --- 2. PUT: Actualizează bio și telefon (în metaData) ---
userProfiles.put('/api/user/profile', authUser, fetchLimiter, async (req, res) => {
    try {
        const { bio, phone_number } = req.body;
        
        // Folosim $set ca să nu suprascriem alte chestii din metaData (cum ar fi lastProfileSearch)
        await users.findByIdAndUpdate(req.user.id, {
            $set: { 
                "metaData.description": sanitize(bio),
                "metaData.phoneNumber": sanitize(phone_number)
            }
        });

        res.json({ success: true, message: 'Profil actualizat.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Eroare la actualizare.' });
    }
});

// --- 3. POST: Upload Avatar Nou ---
userProfiles.post('/api/user/avatar', authUser, fetchLimiter, uploadAvatar, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "Lipsește imaginea." });

        const currentUser = await users.findById(req.user.id);
        if (!currentUser) return res.status(404).json({ success: false, message: "Utilizator negăsit." });

        const oldIcon = currentUser.icon;

        
        const newPublicUrl = await uploadToR2(req.file);

        currentUser.icon = newPublicUrl;
        await currentUser.save();

        await sales.updateMany(
            { user_id: req.user.id },
            { $set: { user_image: newPublicUrl } }
        );

        deleteFromR2(oldIcon);

        res.json({ success: true, newUrl: newPublicUrl, message: 'Avatar schimbat.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Eroare la upload.' });
    }
});

userProfiles.delete('/api/user/avatar', authUser, fetchLimiter, async (req, res) => {
    try {
        const currentUser = await users.findById(req.user.id);
        if (!currentUser) return res.status(404).json({ success: false, message: "Utilizator negăsit." });

        const oldIcon = currentUser.icon;

        if (oldIcon === DEFAULT_AVATAR) {
            return res.json({ success: true, newUrl: DEFAULT_AVATAR, message: 'Poza este deja cea implicită.' });
        }

        currentUser.icon = DEFAULT_AVATAR;
        await currentUser.save();

        await sales.updateMany(
            { user_id: req.user.id },
            { $set: { user_image: DEFAULT_AVATAR } }
        );

        deleteFromR2(oldIcon);

        return res.json({ success: true, newUrl: DEFAULT_AVATAR, message: 'Poză ștearsă.' });
    } catch (error) {
        console.error("Delete Avatar Error:", error);
        return res.status(500).json({ success: false, message: 'Eroare la ștergerea pozei.' });
    }
});

userProfiles.get('/api/users/search', authUser, fetchLimiter, async (req, res) => {
    try {
        const { query } = req.query;
        const currentUserId = req.user.id; // <--- Avem nevoie de ID-ul tău

        if (!query || query.trim() === '') {
            return res.json({ success: true, data: [] });
        }

        const currentUser = await users.findById(currentUserId).select('blocking blocked_by');
        
        const excludedIds = [
            ...currentUser.blocking,
            ...currentUser.blocked_by,
            new mongoose.Types.ObjectId(currentUserId), // ← același tip
        ];

        const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'i');

        const results = await users.find({ username: { $regex: regex }, _id: { $nin: excludedIds } })
            .select('_id username icon')
            .limit(20);

        return res.json({ success: true, data: results });

    } catch (error) {
        return res.status(500).json({ success: false });
    }
});

userProfiles.get('/api/sales/user-profile/:userId', authUser, fetchLimiter, async (req, res) => {
    try {
        const { userId } = req.params;
        const currentUserId = req.user.id;
        
        // --- ADĂUGĂRI PENTRU PAGINARE ---
        const { cursor } = req.query;
        const limit = parseInt(req.query.limit) || 20;

        // 1. Căutăm datele utilizatorului INCLUSIV metaData
        const user = await users.findById(userId).select('username icon metaData blocking blocked_by');

        if (!user) {
            return res.status(404).json({ success: false, message: "Utilizator negăsit." });
        }

        const isBlockedByTarget = user.blocking.some(id => id.toString() === currentUserId);
        const hasBlockedTarget = user.blocked_by.some(id => id.toString() === currentUserId);

        if (isBlockedByTarget || hasBlockedTarget) {
            // Returnăm 404 ca să părem invizibili, nu 403 (Forbidden)
            return res.status(404).json({ success: false, message: "Utilizator negăsit." });
        }

        // 2. Căutăm anunțurile (Logica NOUĂ cu Cursor)
        let query = { user_id: userId, is_active: true };

        if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
            query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
        }

        // Folosim _id: -1 în loc de createdAt: -1 pentru stabilitatea cursorului
        const userPosts = await sales.find(query)
            .sort({ _id: -1 })
            .limit(limit)
            .populate('user_id', 'username icon');

        // Calculăm cursorul pentru următoarea pagină
        let nextCursor = null;
        if (userPosts.length === limit) {
            nextCursor = userPosts[userPosts.length - 1]._id;
        }

        const postsWithLikeStatus = userPosts.map(doc => {
            const postObj = doc.toObject({ getters: true, virtuals: true });
            const likedByStrings = postObj.liked_by ? postObj.liked_by.map(like => like.user_id.toString()) : [];
            delete postObj.liked_by;
            return {
                ...postObj,
                hasLiked: likedByStrings.includes(currentUserId)
            };
        });

        // 3. Logică Telefon: Prioritate profil -> apoi anunțuri
        let phoneNumber = user.metaData?.phoneNumber;
        if (!phoneNumber && userPosts.length > 0) {
            phoneNumber = userPosts[0].phone_number;
        }

        // 4. Logică Descriere: Prioritate profil -> apoi default
        const bio = user.metaData?.description || `Acest cont nu are descriere.`;

        return res.json({
            success: true,
            user: {
                _id: user._id,
                username: user.username,
                icon: user.icon,
                phone_number: phoneNumber,
                bio: bio 
            },
            posts: postsWithLikeStatus,
            // --- RETURNĂM DATELE PENTRU PAGINARE ---
            nextCursor,
            hasMore: userPosts.length === limit
        });

    } catch (error) {
        console.error("Error fetching user profile:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
});

// --- RUTA MODIFICATĂ PENTRU ARRAY-UL DE SESIUNI ---
userProfiles.put('/api/users/save-push-token', authUser, fetchLimiter, async (req, res) => {
    try {
        // Frontend-ul trimite { token: "fcm_..." }
        const { token: fcmToken } = req.body;
        
        if (!fcmToken) {
            return res.status(400).json({ success: false, message: 'Token lipsă' });
        }

        const user = await users.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false });

        // 1. Verificăm dacă token-ul există deja pe vreo sesiune (evităm duplicate)
        const alreadyExists = user.refreshTokens.some(session => session.fcmToken === fcmToken);
        
        if (alreadyExists) {
            return res.json({ success: true, message: 'Token deja existent' });
        }

        // 2. Căutăm o sesiune activă care NU are FCM setat (fcmToken: null)
        // Începem de la sfârșit (cele mai recente sesiuni), deoarece userul tocmai s-a logat
        let updated = false;
        for (let i = user.refreshTokens.length - 1; i >= 0; i--) {
            if (!user.refreshTokens[i].fcmToken) {
                user.refreshTokens[i].fcmToken = fcmToken;
                updated = true;
                break; // Îl atașăm doar la cea mai recentă sesiune disponibilă
            }
        }

        // 3. Dacă nu am găsit nicio sesiune liberă (caz rar), îl punem pe ultima (cea curentă)
        if (!updated && user.refreshTokens.length > 0) {
            user.refreshTokens[user.refreshTokens.length - 1].fcmToken = fcmToken;
            updated = true;
        }

        if (updated) {
            // Este CRITIC să folosim markModified când modificăm obiecte din array
            user.markModified('refreshTokens');
            await user.save();
            return res.json({ success: true, message: 'Token salvat pe sesiune' });
        }

        return res.json({ success: true, message: 'Nu s-a putut salva tokenul (nicio sesiune activă)' });

    } catch (error) {
        console.error("Eroare la salvare token:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- 1. GET: Obține ultimul profil căutat ---
userProfiles.get('/api/users/last-search', authUser, fetchLimiter, async (req, res) => {
    try {

        const currentUser = await users.findById(req.user.id).select('metaData blocking blocked_by');

        if (!currentUser || !currentUser.metaData || !currentUser.metaData.lastProfileSearch) {
            return res.json({ success: true, data: null });
        }

        const lastSearchedId = currentUser.metaData.lastProfileSearch;

        const isBlocked = currentUser.blocking.some(id => id.toString() === lastSearchedId.toString()) || 
        currentUser.blocked_by.some(id => id.toString() === lastSearchedId.toString());

        if (isBlocked) {
            return res.json({ success: true, data: null }); // Îl ascundem
        }

        const lastSearchedUser = await users.findById(lastSearchedId)
            .select('_id username icon');

        if (!lastSearchedUser) {
            return res.json({ success: true, data: null });
        }

        return res.json({ success: true, data: lastSearchedUser });

    } catch (error) {
        console.error("Eroare la get last search:", error);
        return res.status(500).json({ success: false });
    }
});

// --- 2. PUT: Salvează/Suprascrie ultimul profil căutat ---
userProfiles.put('/api/users/last-search', authUser, fetchLimiter, async (req, res) => {
    try {
        const { targetUserId } = req.body;

        if (!targetUserId) {
            return res.status(400).json({ success: false });
        }

        // Folosim $set pentru a modifica DOAR câmpul lastProfileSearch din obiectul metaData
        // Fără a afecta alte câmpuri din metaData (ex: phoneNumber, description)
        await users.findByIdAndUpdate(req.user.id, {
            $set: { "metaData.lastProfileSearch": targetUserId }
        });

        return res.json({ success: true });

    } catch (error) {
        console.error("Eroare la save last search:", error);
        return res.status(500).json({ success: false });
    }
});


// =========================================================================
//                    LISTA UTILIZATORI BLOCAȚI
// =========================================================================
userProfiles.get('/api/user/blocked-list', authUser, fetchLimiter, async (req, res) => {
    try {
        const user = await users.findById(req.user.id)
            .select('blocking')
            .populate('blocking', '_id username icon');

        if (!user) {
            return res.status(404).json({ success: false, message: "Utilizator negăsit." });
        }

        // Filtrăm eventualele referințe orfane (useri șterși din DB)
        const cleanList = (user.blocking || []).filter(u => u !== null);

        return res.json({ success: true, data: cleanList });

    } catch (error) {
        console.error("Blocked List Error:", error);
        return res.status(500).json({ success: false, message: "Eroare la încărcarea listei." });
    }
});


// =========================================================================
//                    SCHIMBARE NUME UTILIZATOR
// =========================================================================
userProfiles.put('/api/user/change-username', authUser, fetchLimiter, async (req, res) => {
    try {
        const { newUsername } = req.body;

        // 1. Validare prezență
        if (!newUsername || typeof newUsername !== 'string') {
            return res.status(400).json({ success: false, message: "Numele de utilizator este obligatoriu." });
        }

        const trimmed = newUsername.trim();

        // 2. Validare lungime
        if (trimmed.length < 3 || trimmed.length > 16) {
            return res.status(400).json({ success: false, message: "Numele trebuie să aibă între 3 și 16 caractere." });
        }

        // 3. Validare caractere (doar litere, cifre, punct, underscore)
        const usernameRegex = /^[a-zA-Z0-9_.]+$/;
        if (!usernameRegex.test(trimmed)) {
            return res.status(400).json({ success: false, message: "Numele poate conține doar litere, cifre, punct (.) și underscore (_)." });
        }

        // 4. Verificare unicitate (case-insensitive, excluzându-se pe sine)
        const existing = await users.findOne({
            username: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            _id: { $ne: req.user.id }
        });

        if (existing) {
            return res.status(400).json({ success: false, message: "Acest nume de utilizator este deja folosit." });
        }

        // 5. Verificăm că nu e identic cu cel curent (evităm write-uri inutile)
        const currentUser = await users.findById(req.user.id).select('username');
        if (currentUser.username === trimmed) {
            return res.status(400).json({ success: false, message: "Acesta este deja numele tău curent." });
        }

        // 6. Actualizăm username-ul pe user
        currentUser.username = trimmed;
        await currentUser.save();

        // 7. Actualizăm câmpul denormalizat user_name pe TOATE anunțurile
        await sales.updateMany(
            { user_id: req.user.id },
            { $set: { user_name: trimmed } }
        );

        return res.json({ success: true, message: "Numele a fost schimbat cu succes.", newUsername: trimmed });

    } catch (error) {
        // Dacă MongoDB aruncă duplicate key error (race condition)
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Acest nume de utilizator este deja folosit." });
        }
        console.error("Change Username Error:", error);
        return res.status(500).json({ success: false, message: "Eroare la schimbarea numelui." });
    }
});

export default userProfiles;