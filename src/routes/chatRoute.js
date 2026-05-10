import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { authUser, fetchLimiter } from './usersRoute.js';
import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import users from '../models/userModel.js';
import { getIO } from '../socket/socketManager.js';
import { sendAndSaveNotification } from '../services/notificationService.js';
import sales from '../models/salesModel.js';

const chatRoute = Router();

// ─── R2 Setup ────────────────────────────────────────────────────────────────
const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

// ─── Multer în memorie (doar pentru poze chat) ────────────────────────────────
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Doar imagini sunt permise.'), false);
        }
    }
});

// ─── Helper: verifică block bilateral ────────────────────────────────────────
const checkBlocked = async (userAId, userBId) => {
    const userA = await users.findById(userAId).select('blocking blocked_by').lean();
    if (!userA) return true;
    return (
        userA.blocking?.some(id => id.toString() === userBId.toString()) ||
        userA.blocked_by?.some(id => id.toString() === userBId.toString())
    );
};


// ==========================================
// 1. GET: Lista conversații (cu filtru block)
// ==========================================
chatRoute.get('/api/chat/conversations', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;

        const currentUser = await users.findById(userId).select('blocking blocked_by').lean();
        if (!currentUser) {
            return res.status(404).json({ success: false, message: 'Utilizator negăsit.' });
        }

        const blockedIds = [
            ...(currentUser.blocking || []).map(id => id.toString()),
            ...(currentUser.blocked_by || []).map(id => id.toString())
        ];

        const conversations = await Conversation.find({
            participants: userId,
            deleted_by: { $ne: userId },
            last_message: { $ne: null }
        })
        .sort({ last_message_at: -1 })
        .populate('participants', 'username icon')
        .lean();

        const filtered = conversations.filter(conv => {
            const otherParticipant = conv.participants.find(
                p => p && p._id.toString() !== userId
            );
            if (!otherParticipant) return false;
            return !blockedIds.includes(otherParticipant._id.toString());
        });

        const formatted = filtered.map(conv => {
            const otherParticipant = conv.participants.find(
                p => p && p._id.toString() !== userId
            );
            const unreadCount = conv.unread_counts?.[userId] || 0;

            return {
                _id: conv._id,
                participant: otherParticipant,
                last_message: conv.last_message,
                last_message_type: conv.last_message_type,
                last_message_at: conv.last_message_at,
                unread_count: unreadCount
            };
        });

        return res.json({ success: true, data: formatted });

    } catch (error) {
        console.error('❌ GET /api/chat/conversations:', error);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});


// ==========================================
// 2. POST: Creează sau găsește conversație
// ==========================================
chatRoute.post('/api/chat/conversations', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const { targetUserId } = req.body;

        if (!targetUserId) {
            return res.status(400).json({ success: false, message: 'targetUserId lipsește.' });
        }

        if (targetUserId === userId) {
            return res.status(400).json({ success: false, message: 'Nu poți discuta cu tine însuți.' });
        }

        if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
            return res.status(400).json({ success: false, message: 'ID invalid.' });
        }

        const isBlocked = await checkBlocked(userId, targetUserId);
        if (isBlocked) {
            return res.status(403).json({ success: false, message: 'Nu poți trimite mesaje acestui utilizator.' });
        }

        const targetUser = await users.findById(targetUserId).select('username icon').lean();
        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'Utilizator negăsit.' });
        }

        let conversation = await Conversation.findOne({
            participants: { $all: [userId, targetUserId], $size: 2 }
        });

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [userId, targetUserId],
                unread_counts: {
                    [userId]: 0,
                    [targetUserId]: 0
                }
            });
        } else {
            if (conversation.deleted_by?.some(id => id.toString() === userId)) {
                await Conversation.findByIdAndUpdate(conversation._id, {
                    $pull: { deleted_by: userId }
                });
            }
        }

        const io = getIO();
        if (io) {
            const convIdStr = conversation._id.toString();
            io.in(`user_${targetUserId}`).socketsJoin(`conv_${convIdStr}`);
            io.in(`user_${userId}`).socketsJoin(`conv_${convIdStr}`);
        }

        return res.json({
            success: true,
            data: {
                _id: conversation._id,
                participant: targetUser
            }
        });

    } catch (error) {
        console.error('❌ POST /api/chat/conversations:', error);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});


// ==========================================
// 3. GET: Mesaje dintr-o conversație (cursor pagination)
// ==========================================
chatRoute.get('/api/chat/messages/:conversationId', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;
        const { cursor } = req.query;
        const limit = 30;

        if (!mongoose.Types.ObjectId.isValid(conversationId)) {
            return res.status(400).json({ success: false, message: 'ID conversație invalid.' });
        }

        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId
        }).lean();

        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversație negăsită.' });
        }

        const otherParticipantId = conversation.participants
            .find(p => p.toString() !== userId)
            ?.toString();

        if (otherParticipantId) {
            const isBlocked = await checkBlocked(userId, otherParticipantId);
            if (isBlocked) {
                return res.status(403).json({ success: false, message: 'Conversație indisponibilă.' });
            }
        }

        let query = { conversation_id: conversationId };
        if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
            query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
        }

        const messages = await Message.find(query)
            .sort({ _id: -1 })
            .limit(limit)
            .populate('sender_id', 'username icon')
            .lean();

        let nextCursor = null;
        if (messages.length === limit) {
            nextCursor = messages[messages.length - 1]._id;
        }

        const reversed = [...messages].reverse();

        return res.json({
            success: true,
            data: reversed,
            nextCursor,
            hasMore: messages.length === limit
        });

    } catch (error) {
        console.error('❌ GET /api/chat/messages:', error);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});


// ==========================================
// 4. POST: Upload poză în chat
// ==========================================
chatRoute.post('/api/chat/send-image', authUser, upload.single('image'), fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Imaginea lipsește.' });
        }

        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
            return res.status(400).json({ success: false, message: 'conversationId invalid.' });
        }

        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId
        }).lean();

        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversație negăsită.' });
        }

        const recipientId = conversation.participants
            .find(p => p.toString() !== userId)
            ?.toString();

        if (recipientId) {
            const isBlocked = await checkBlocked(userId, recipientId);
            if (isBlocked) {
                return res.status(403).json({ success: false, message: 'Nu poți trimite mesaje acestui utilizator.' });
            }
        }

        const compressedBuffer = await sharp(req.file.buffer)
            .resize({
                width: 1200,
                height: 1200,
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 80 })
            .toBuffer();

        const fileName = `chat_${Date.now()}_${Math.round(Math.random() * 1E9)}.jpg`;

        await r2.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: fileName,
            Body: compressedBuffer,
            ContentType: 'image/jpeg',
            ContentLength: compressedBuffer.length
        }));

        const imageUrl = `${process.env.R2_PUBLIC_DOMAIN}/${fileName}`;

        const newMessage = await Message.create({
            conversation_id: conversationId,
            sender_id: userId,
            type: 'image',
            image_url: imageUrl,
            image_public_id: fileName
        });

        await Conversation.findByIdAndUpdate(conversationId, {
            last_message: '📷 Imagine',
            last_message_type: 'image',
            last_message_at: new Date(),
            $inc: { [`unread_counts.${recipientId}`]: 1 },
            $pull: { deleted_by: recipientId }
        });

        const populatedMessage = await Message.findById(newMessage._id)
            .populate('sender_id', 'username icon')
            .lean();

        const io = getIO();
        if (io) {
            io.to(`conv_${conversationId}`).emit('new_message', populatedMessage);
            io.to(`conv_${conversationId}`).emit('conversation_updated', {
                conversationId,
                last_message: '📷 Imagine',
                last_message_type: 'image',
                last_message_at: new Date()
            });
        }

        // ─── FCM trimis mereu — același motiv ca la mesajele text ────────────
        if (recipientId) {
            const senderData = await users.findById(userId).select('username icon').lean();
            await sendAndSaveNotification(
                [recipientId],
                {
                    type: 'NEW_MESSAGE',
                    title: senderData?.username || 'Mesaj nou',
                    body: '📷 Ți-a trimis o poză',
                    saleId: null,
                    commentId: conversationId
                },
                {
                    id: userId,
                    name: senderData?.username || '',
                    image: senderData?.icon || ''
                }
            );
        }
        // ─────────────────────────────────────────────────────────────────────

        return res.json({
            success: true,
            data: populatedMessage
        });

    } catch (error) {
        console.error('❌ POST /api/chat/send-image:', error);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});


// ==========================================
// 5. DELETE: Șterge conversație (doar pentru tine)
// ==========================================
chatRoute.delete('/api/chat/conversations/:conversationId', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(conversationId)) {
            return res.status(400).json({ success: false, message: 'ID invalid.' });
        }

        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId
        });

        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversație negăsită.' });
        }

        await Conversation.findByIdAndUpdate(conversationId, {
            $addToSet: { deleted_by: userId },
            $set: { [`unread_counts.${userId}`]: 0 }
        });

        return res.json({ success: true, message: 'Conversație ștearsă.' });

    } catch (error) {
        console.error('❌ DELETE /api/chat/conversations:', error);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});


// ==========================================
// 6. GET: Total unread count (pentru badge tab navigator)
// ==========================================
chatRoute.get('/api/chat/unread-count', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;

        const currentUser = await users.findById(userId).select('blocking blocked_by').lean();
        if (!currentUser) return res.status(404).json({ success: false, message: 'Utilizator negăsit.' });

        const blockedIds = [
            ...(currentUser.blocking || []).map(id => id.toString()),
            ...(currentUser.blocked_by || []).map(id => id.toString())
        ];

        const conversations = await Conversation.find({
            participants: userId,
            deleted_by: { $ne: userId }
        }).populate('participants', '_id').lean();

        let totalUnread = 0;

        for (const conv of conversations) {
            const otherParticipant = conv.participants.find(
                p => p && p._id.toString() !== userId
            );
            if (otherParticipant && blockedIds.includes(otherParticipant._id.toString())) {
                continue;
            }
            const count = conv.unread_counts?.[userId] || 0;
            totalUnread += count;
        }

        return res.json({ success: true, unreadCount: totalUnread });

    } catch (error) {
        console.error('❌ GET /api/chat/unread-count:', error);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});


// ==========================================
// 7. PUT: Marchează conversație ca citită (REST fallback)
// ==========================================
chatRoute.put('/api/chat/conversations/:conversationId/read', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(conversationId)) {
            return res.status(400).json({ success: false, message: 'ID invalid.' });
        }

        await Conversation.findOneAndUpdate(
            { _id: conversationId, participants: userId },
            { $set: { [`unread_counts.${userId}`]: 0 } }
        );

        await Message.updateMany(
            {
                conversation_id: conversationId,
                sender_id: { $ne: userId },
                is_read: false
            },
            { $set: { is_read: true } }
        );

        return res.json({ success: true });

    } catch (error) {
        console.error('❌ PUT read:', error);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});


// ==========================================
// 8. DELETE: Șterge mesaj (soft delete)
// ==========================================
chatRoute.delete('/api/chat/messages/:messageId', authUser, fetchLimiter, async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.id;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ success: false, message: 'Mesajul nu există.' });
        }

        if (message.sender_id.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'Nu poți șterge acest mesaj.' });
        }

        if (message.type === 'image' && message.image_public_id) {
            await r2.send(new DeleteObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: message.image_public_id
            })).catch(() => {});
        }

        message.type = 'text';
        message.text = 'Acest mesaj a fost șters';
        message.image_url = null;
        message.image_public_id = null;
        message.is_deleted = true;
        await message.save();

        const lastMessage = await Message.findOne({ conversation_id: message.conversation_id })
            .sort({ _id: -1 })
            .lean();

        if (lastMessage && lastMessage._id.toString() === messageId) {
            await Conversation.findByIdAndUpdate(message.conversation_id, {
                last_message: 'Acest mesaj a fost șters',
                last_message_type: 'text'
            });
        }

        const io = getIO();
        if (io) {
            io.to(`conv_${message.conversation_id}`).emit('message_deleted', {
                messageId: message._id,
                conversationId: message.conversation_id
            });
            io.to(`conv_${message.conversation_id}`).emit('conversation_updated', {
                conversationId: message.conversation_id,
                last_message: 'Acest mesaj a fost șters',
                last_message_type: 'text',
                last_message_at: message.createdAt
            });
        }

        return res.json({ success: true });

    } catch (error) {
        console.error('❌ Eroare delete mesaj:', error);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});

// ==========================================
// 9. POST: Trimite mesaj cu link anunț
// ==========================================
chatRoute.post('/api/chat/send-sale-message', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const { targetUserId, saleId, text } = req.body;

        // ── Validări de bază ─────────────────────────────────────────
        if (!targetUserId || !saleId) {
            return res.status(400).json({ success: false, message: 'targetUserId și saleId sunt obligatorii.' });
        }

        if (targetUserId === userId) {
            return res.status(400).json({ success: false, message: 'Nu poți trimite mesaj pe propriul anunț.' });
        }

        if (!mongoose.Types.ObjectId.isValid(targetUserId) || !mongoose.Types.ObjectId.isValid(saleId)) {
            return res.status(400).json({ success: false, message: 'ID-uri invalide.' });
        }

        // ── Validare text (opțional, max 500 caractere) ──────────────
        let sanitizedText = null;
        if (text && typeof text === 'string') {
            const trimmed = text.trim();
            if (trimmed.length > 500) {
                return res.status(400).json({ success: false, message: 'Mesajul nu poate depăși 500 de caractere.' });
            }
            if (trimmed.length > 0) {
                sanitizedText = trimmed;
            }
        }

        // ── Verificare block bilateral ───────────────────────────────
        const isBlocked = await checkBlocked(userId, targetUserId);
        if (isBlocked) {
            return res.status(403).json({ success: false, message: 'Nu poți trimite mesaje acestui utilizator.' });
        }

        // ── Verificare target user există ────────────────────────────
        const targetUser = await users.findById(targetUserId).select('username icon').lean();
        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'Utilizator negăsit.' });
        }

        const sale = await sales.findById(saleId)
            .select('title price media user_id is_active')
            .lean();

        if (!sale || !sale.is_active) {
            return res.status(404).json({ success: false, message: 'Anunțul nu mai este disponibil.' });
        }

        // ── Extragem prima imagine pentru preview ────────────────────
        let previewImageUrl = null;
        if (sale.media && sale.media.length > 0) {
            const firstImage = sale.media.find(m => m.type === 'image');
            previewImageUrl = firstImage ? firstImage.url : sale.media[0].url;
        }

        // ── Creează sau găsește conversația ───────────────────────────
        let conversation = await Conversation.findOne({
            participants: { $all: [userId, targetUserId], $size: 2 }
        });

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [userId, targetUserId],
                unread_counts: { [userId]: 0, [targetUserId]: 0 }
            });
        } else {
            // Dacă vreunul a șters-o, o readucem
            const deletedByArray = conversation.deleted_by || [];
            const pullIds = [];
            if (deletedByArray.some(id => id.toString() === userId)) pullIds.push(userId);
            if (deletedByArray.some(id => id.toString() === targetUserId)) pullIds.push(targetUserId);
            if (pullIds.length > 0) {
                await Conversation.findByIdAndUpdate(conversation._id, {
                    $pull: { deleted_by: { $in: pullIds } }
                });
            }
        }

        const conversationId = conversation._id.toString();

        // ── Creează mesajul ──────────────────────────────────────────
        const newMessage = await Message.create({
            conversation_id: conversation._id,
            sender_id: userId,
            type: 'sale_link',
            text: sanitizedText,
            sale_preview: {
                sale_id: saleId,
                image_url: previewImageUrl,
                title: sale.title || 'Anunț',
                price: sale.price || 0
            }
        });

        // ── Actualizează conversația ─────────────────────────────────
        const previewTitle = sale.title || 'Anunț';
        await Conversation.findByIdAndUpdate(conversation._id, {
            last_message: `🚗 ${previewTitle}`,
            last_message_type: 'text',
            last_message_at: new Date(),
            $inc: { [`unread_counts.${targetUserId}`]: 1 },
            $pull: { deleted_by: targetUserId }
        });

        // ── Populează mesajul pentru emit ─────────────────────────────
        const populatedMessage = await Message.findById(newMessage._id)
            .populate('sender_id', 'username icon')
            .lean();

        // ── Socket emit ──────────────────────────────────────────────
        const io = getIO();
        if (io) {
            io.in(`user_${targetUserId}`).socketsJoin(`conv_${conversationId}`);
            io.in(`user_${userId}`).socketsJoin(`conv_${conversationId}`);

            io.to(`conv_${conversationId}`).emit('new_message', populatedMessage);
            io.to(`conv_${conversationId}`).emit('conversation_updated', {
                conversationId,
                last_message: `🚗 ${previewTitle}`,
                last_message_type: 'text',
                last_message_at: new Date()
            });
        }

        // ── FCM notificare ───────────────────────────────────────────
        const senderData = await users.findById(userId).select('username icon').lean();
        await sendAndSaveNotification(
            [targetUserId],
            {
                type: 'NEW_MESSAGE',
                title: senderData?.username || 'Mesaj nou',
                body: `🚗 Ți-a trimis un mesaj despre "${previewTitle}"`,
                saleId: null,
                commentId: conversationId
            },
            {
                id: userId,
                name: senderData?.username || '',
                image: senderData?.icon || ''
            }
        );

        return res.json({
            success: true,
            data: {
                message: populatedMessage,
                conversationId,
                participant: targetUser
            }
        });

    } catch (error) {
        console.error('❌ POST /api/chat/send-sale-message:', error);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});


export default chatRoute;