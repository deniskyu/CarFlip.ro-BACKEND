import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { authUser, fetchLimiter } from './usersRoute.js';
import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import users from '../models/userModel.js';
import { getIO, emitUnreadTotal } from '../socket/socketManager.js';
import { sendAndSaveNotification } from '../services/notificationService.js';
import sales from '../models/salesModel.js';

const chatRoute = Router();

const MESSAGE_PAGE_SIZE = 30;
const MAX_MESSAGE_PAGE_SIZE = 50;
const CONVERSATION_PAGE_SIZE = 200;
const DELETED_MESSAGE_TEXT = 'Acest mesaj a fost șters';

const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Doar imagini sunt permise.'), false);
        }
    }
});

const uploadSingleImage = (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (!err) return next();
        const message = err.code === 'LIMIT_FILE_SIZE'
            ? 'Imaginea depășește 10MB.'
            : (err.message || 'Fișier invalid.');
        return res.status(400).json({ success: false, message });
    });
};

const isValidId = (value) => {
    if (!value) return false;
    return mongoose.Types.ObjectId.isValid(String(value));
};

const readUnreadValue = (map, key) => {
    if (!map) return 0;
    if (map instanceof Map) return Number(map.get(key)) || 0;
    if (typeof map === 'object') return Number(map[key]) || 0;
    return 0;
};

const checkBlocked = async (userAId, userBId) => {
    if (!isValidId(userAId) || !isValidId(userBId)) return true;
    const userA = await users.findById(userAId).select('blocking blocked_by').lean();
    if (!userA) return true;
    const target = String(userBId);
    return (
        (userA.blocking || []).some(id => String(id) === target) ||
        (userA.blocked_by || []).some(id => String(id) === target)
    );
};

const otherParticipantId = (conversation, userId) => {
    const key = String(userId);
    const found = (conversation?.participants || [])
        .map(p => (p && p._id ? String(p._id) : String(p)))
        .find(p => p !== key);
    return found || null;
};

const formatConversation = (conv, userId) => {
    const key = String(userId);
    const other = (conv.participants || []).find(p => p && String(p._id) !== key);
    if (!other) return null;
    return {
        _id: conv._id,
        participant: other,
        last_message: conv.last_message,
        last_message_type: conv.last_message_type,
        last_message_at: conv.last_message_at,
        unread_count: readUnreadValue(conv.unread_counts, key)
    };
};


chatRoute.get('/api/chat/conversations', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;

        const currentUser = await users.findById(userId).select('blocking blocked_by').lean();
        if (!currentUser) {
            return res.status(404).json({ success: false, message: 'Utilizator negăsit.' });
        }

        const blockedIds = new Set([
            ...(currentUser.blocking || []).map(id => String(id)),
            ...(currentUser.blocked_by || []).map(id => String(id))
        ]);

        const conversations = await Conversation.find({
            participants: userId,
            deleted_by: { $ne: userId },
            last_message: { $ne: null }
        })
        .sort({ last_message_at: -1 })
        .limit(CONVERSATION_PAGE_SIZE)
        .populate('participants', 'username icon')
        .lean();

        const formatted = [];
        for (const conv of conversations) {
            const item = formatConversation(conv, userId);
            if (!item) continue;
            if (blockedIds.has(String(item.participant._id))) continue;
            formatted.push(item);
        }

        return res.json({ success: true, data: formatted });

    } catch (error) {
        console.error('❌ GET /api/chat/conversations:', error);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});


chatRoute.get('/api/chat/conversations/:conversationId', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;

        if (!isValidId(conversationId)) {
            return res.status(400).json({ success: false, message: 'ID conversație invalid.' });
        }

        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId
        })
        .populate('participants', 'username icon')
        .lean();

        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversație negăsită.' });
        }

        const formatted = formatConversation(conversation, userId);
        if (!formatted) {
            return res.status(404).json({ success: false, message: 'Participant negăsit.' });
        }

        return res.json({ success: true, data: formatted });

    } catch (error) {
        console.error('❌ GET /api/chat/conversations/:id:', error);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});


chatRoute.post('/api/chat/conversations', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const { targetUserId } = req.body;

        if (!targetUserId) {
            return res.status(400).json({ success: false, message: 'targetUserId lipsește.' });
        }

        if (String(targetUserId) === String(userId)) {
            return res.status(400).json({ success: false, message: 'Nu poți discuta cu tine însuți.' });
        }

        if (!isValidId(targetUserId)) {
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
                    [String(userId)]: 0,
                    [String(targetUserId)]: 0
                }
            });
        } else if ((conversation.deleted_by || []).some(id => String(id) === String(userId))) {
            await Conversation.findByIdAndUpdate(conversation._id, {
                $pull: { deleted_by: userId }
            });
        }

        const io = getIO();
        if (io) {
            const convIdStr = String(conversation._id);
            io.in(`user_${String(targetUserId)}`).socketsJoin(`conv_${convIdStr}`);
            io.in(`user_${String(userId)}`).socketsJoin(`conv_${convIdStr}`);
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


chatRoute.get('/api/chat/messages/:conversationId', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;
        const { cursor } = req.query;

        const requestedLimit = parseInt(req.query.limit, 10);
        const limit = Number.isFinite(requestedLimit)
            ? Math.min(MAX_MESSAGE_PAGE_SIZE, Math.max(1, requestedLimit))
            : MESSAGE_PAGE_SIZE;

        if (!isValidId(conversationId)) {
            return res.status(400).json({ success: false, message: 'ID conversație invalid.' });
        }

        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId
        }).select('participants').lean();

        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversație negăsită.' });
        }

        const recipientId = otherParticipantId(conversation, userId);

        if (recipientId) {
            const isBlocked = await checkBlocked(userId, recipientId);
            if (isBlocked) {
                return res.status(403).json({ success: false, message: 'Conversație indisponibilă.' });
            }
        }

        const query = { conversation_id: conversationId };
        if (cursor) {
            if (!isValidId(cursor)) {
                return res.status(400).json({ success: false, message: 'Cursor invalid.' });
            }
            query._id = { $lt: new mongoose.Types.ObjectId(String(cursor)) };
        }

        const fetched = await Message.find(query)
            .sort({ _id: -1 })
            .limit(limit + 1)
            .populate('sender_id', 'username icon')
            .lean();

        const hasMore = fetched.length > limit;
        const page = hasMore ? fetched.slice(0, limit) : fetched;
        const nextCursor = page.length > 0 ? page[page.length - 1]._id : null;

        return res.json({
            success: true,
            data: [...page].reverse(),
            nextCursor,
            hasMore
        });

    } catch (error) {
        console.error('❌ GET /api/chat/messages:', error);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});


chatRoute.post('/api/chat/send-image', authUser, fetchLimiter, uploadSingleImage, async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.body;

        if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
            return res.status(400).json({ success: false, message: 'Imaginea lipsește.' });
        }

        if (!isValidId(conversationId)) {
            return res.status(400).json({ success: false, message: 'conversationId invalid.' });
        }

        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId
        }).select('participants').lean();

        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversație negăsită.' });
        }

        const recipientId = otherParticipantId(conversation, userId);

        if (!recipientId) {
            return res.status(400).json({ success: false, message: 'Recipient negăsit.' });
        }

        const isBlocked = await checkBlocked(userId, recipientId);
        if (isBlocked) {
            return res.status(403).json({ success: false, message: 'Nu poți trimite mesaje acestui utilizator.' });
        }

        let compressedBuffer;
        try {
            compressedBuffer = await sharp(req.file.buffer)
                .rotate()
                .resize({
                    width: 1200,
                    height: 1200,
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality: 80 })
                .toBuffer();
        } catch (sharpErr) {
            console.error('❌ sharp:', sharpErr.message);
            return res.status(400).json({ success: false, message: 'Imaginea nu a putut fi procesată.' });
        }

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

        const now = new Date();

        await Conversation.findByIdAndUpdate(conversationId, {
            last_message: '📷 Imagine',
            last_message_type: 'image',
            last_message_at: now,
            $inc: { [`unread_counts.${recipientId}`]: 1 },
            $pull: { deleted_by: { $in: [recipientId, userId] } }
        });

        const populatedMessage = await Message.findById(newMessage._id)
            .populate('sender_id', 'username icon')
            .lean();

        const io = getIO();
        if (io) {
            io.in(`user_${recipientId}`).socketsJoin(`conv_${String(conversationId)}`);
            io.in(`user_${String(userId)}`).socketsJoin(`conv_${String(conversationId)}`);

            io.to(`conv_${conversationId}`).emit('new_message', populatedMessage);
            io.to(`conv_${conversationId}`).emit('conversation_updated', {
                conversationId: String(conversationId),
                senderId: String(userId),
                unreadIncrement: 1,
                silent: false,
                last_message: '📷 Imagine',
                last_message_type: 'image',
                last_message_at: now
            });
        }

        res.json({
            success: true,
            data: populatedMessage
        });

        setImmediate(async () => {
            try {
                emitUnreadTotal(recipientId).catch(() => {});
                const senderData = await users.findById(userId).select('username icon').lean();
                await sendAndSaveNotification(
                    [recipientId],
                    {
                        type: 'NEW_MESSAGE',
                        title: senderData?.username || 'Mesaj nou',
                        body: '📷 Ți-a trimis o poză',
                        saleId: null,
                        commentId: String(conversationId)
                    },
                    {
                        id: userId,
                        name: senderData?.username || '',
                        image: senderData?.icon || ''
                    }
                );
            } catch (err) {
                console.error('❌ FCM send-image:', err.message);
            }
        });

        return;

    } catch (error) {
        console.error('❌ POST /api/chat/send-image:', error);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, message: 'Eroare server.' });
        }
    }
});


chatRoute.delete('/api/chat/conversations/:conversationId', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;

        if (!isValidId(conversationId)) {
            return res.status(400).json({ success: false, message: 'ID invalid.' });
        }

        const conversation = await Conversation.findOneAndUpdate(
            { _id: conversationId, participants: userId },
            {
                $addToSet: { deleted_by: userId },
                $set: { [`unread_counts.${userId}`]: 0 }
            }
        ).lean();

        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversație negăsită.' });
        }

        emitUnreadTotal(userId).catch(() => {});

        return res.json({ success: true, message: 'Conversație ștearsă.' });

    } catch (error) {
        console.error('❌ DELETE /api/chat/conversations:', error);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});


chatRoute.get('/api/chat/unread-count', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const key = String(userId);

        const currentUser = await users.findById(userId).select('blocking blocked_by').lean();
        if (!currentUser) return res.status(404).json({ success: false, message: 'Utilizator negăsit.' });

        const blockedIds = new Set([
            ...(currentUser.blocking || []).map(id => String(id)),
            ...(currentUser.blocked_by || []).map(id => String(id))
        ]);

        const conversations = await Conversation.find({
            participants: userId,
            deleted_by: { $ne: userId }
        }).select('participants unread_counts').lean();

        let totalUnread = 0;

        for (const conv of conversations) {
            const other = (conv.participants || []).map(p => String(p)).find(p => p !== key);
            if (other && blockedIds.has(other)) continue;
            totalUnread += readUnreadValue(conv.unread_counts, key);
        }

        return res.json({ success: true, unreadCount: totalUnread < 0 ? 0 : totalUnread });

    } catch (error) {
        console.error('❌ GET /api/chat/unread-count:', error);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});


chatRoute.put('/api/chat/conversations/:conversationId/read', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;

        if (!isValidId(conversationId)) {
            return res.status(400).json({ success: false, message: 'ID invalid.' });
        }

        const conversation = await Conversation.findOneAndUpdate(
            { _id: conversationId, participants: userId },
            { $set: { [`unread_counts.${userId}`]: 0 } }
        ).lean();

        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversație negăsită.' });
        }

        const result = await Message.updateMany(
            {
                conversation_id: conversationId,
                sender_id: { $ne: userId },
                is_read: false
            },
            { $set: { is_read: true } }
        );

        const io = getIO();
        if (io && result?.modifiedCount > 0) {
            io.to(`conv_${conversationId}`).emit('messages_read', {
                conversationId: String(conversationId),
                readBy: String(userId)
            });
        }

        emitUnreadTotal(userId).catch(() => {});

        return res.json({ success: true });

    } catch (error) {
        console.error('❌ PUT read:', error);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});


chatRoute.delete('/api/chat/messages/:messageId', authUser, fetchLimiter, async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.id;

        if (!isValidId(messageId)) {
            return res.status(400).json({ success: false, message: 'ID invalid.' });
        }

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ success: false, message: 'Mesajul nu există.' });
        }

        if (String(message.sender_id) !== String(userId)) {
            return res.status(403).json({ success: false, message: 'Nu poți șterge acest mesaj.' });
        }

        if (message.is_deleted) {
            return res.json({ success: true });
        }

        if (message.type === 'image' && message.image_public_id) {
            try {
                await r2.send(new DeleteObjectCommand({
                    Bucket: process.env.R2_BUCKET_NAME,
                    Key: message.image_public_id
                }));
            } catch (r2Err) {
                console.error('❌ R2 delete:', r2Err.message);
            }
        }

        message.type = 'text';
        message.text = DELETED_MESSAGE_TEXT;
        message.image_url = null;
        message.image_public_id = null;
        message.sale_preview = null;
        message.is_deleted = true;
        await message.save();

        const conversationId = String(message.conversation_id);

        const lastMessage = await Message.findOne({ conversation_id: message.conversation_id })
            .sort({ _id: -1 })
            .select('_id')
            .lean();

        const isLast = !!lastMessage && String(lastMessage._id) === String(messageId);

        if (isLast) {
            await Conversation.findByIdAndUpdate(message.conversation_id, {
                last_message: DELETED_MESSAGE_TEXT,
                last_message_type: 'text'
            });
        }

        const io = getIO();
        if (io) {
            io.to(`conv_${conversationId}`).emit('message_deleted', {
                messageId: String(message._id),
                conversationId
            });

            if (isLast) {
                const conversation = await Conversation.findById(message.conversation_id)
                    .select('last_message_at')
                    .lean();

                io.to(`conv_${conversationId}`).emit('conversation_updated', {
                    conversationId,
                    senderId: String(userId),
                    unreadIncrement: 0,
                    silent: true,
                    last_message: DELETED_MESSAGE_TEXT,
                    last_message_type: 'text',
                    last_message_at: conversation?.last_message_at || null
                });
            }
        }

        return res.json({ success: true });

    } catch (error) {
        console.error('❌ Eroare delete mesaj:', error);
        return res.status(500).json({ success: false, message: 'Eroare server.' });
    }
});


chatRoute.post('/api/chat/send-sale-message', authUser, fetchLimiter, async (req, res) => {
    try {
        const userId = req.user.id;
        const { targetUserId, saleId, text } = req.body;

        if (!targetUserId || !saleId) {
            return res.status(400).json({ success: false, message: 'targetUserId și saleId sunt obligatorii.' });
        }

        if (String(targetUserId) === String(userId)) {
            return res.status(400).json({ success: false, message: 'Nu poți trimite mesaj pe propriul anunț.' });
        }

        if (!isValidId(targetUserId) || !isValidId(saleId)) {
            return res.status(400).json({ success: false, message: 'ID-uri invalide.' });
        }

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

        const isBlocked = await checkBlocked(userId, targetUserId);
        if (isBlocked) {
            return res.status(403).json({ success: false, message: 'Nu poți trimite mesaje acestui utilizator.' });
        }

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

        let previewImageUrl = null;
        if (sale.media && sale.media.length > 0) {
            const firstImage = sale.media.find(m => m && m.type === 'image');
            previewImageUrl = firstImage ? firstImage.url : (sale.media[0]?.url || null);
        }

        let conversation = await Conversation.findOne({
            participants: { $all: [userId, targetUserId], $size: 2 }
        });

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [userId, targetUserId],
                unread_counts: { [String(userId)]: 0, [String(targetUserId)]: 0 }
            });
        }

        const conversationId = String(conversation._id);

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

        const previewTitle = sale.title || 'Anunț';
        const previewText = `🚗 ${previewTitle}`;
        const now = new Date();

        await Conversation.findByIdAndUpdate(conversation._id, {
            last_message: previewText,
            last_message_type: 'sale_link',
            last_message_at: now,
            $inc: { [`unread_counts.${String(targetUserId)}`]: 1 },
            $pull: { deleted_by: { $in: [String(targetUserId), String(userId)] } }
        });

        const populatedMessage = await Message.findById(newMessage._id)
            .populate('sender_id', 'username icon')
            .lean();

        const io = getIO();
        if (io) {
            io.in(`user_${String(targetUserId)}`).socketsJoin(`conv_${conversationId}`);
            io.in(`user_${String(userId)}`).socketsJoin(`conv_${conversationId}`);

            io.to(`conv_${conversationId}`).emit('new_message', populatedMessage);
            io.to(`conv_${conversationId}`).emit('conversation_updated', {
                conversationId,
                senderId: String(userId),
                unreadIncrement: 1,
                silent: false,
                last_message: previewText,
                last_message_type: 'sale_link',
                last_message_at: now
            });
        }

        res.json({
            success: true,
            data: {
                message: populatedMessage,
                conversationId,
                participant: targetUser
            }
        });

        setImmediate(async () => {
            try {
                emitUnreadTotal(targetUserId).catch(() => {});
                const senderData = await users.findById(userId).select('username icon').lean();
                await sendAndSaveNotification(
                    [String(targetUserId)],
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
            } catch (err) {
                console.error('❌ FCM send-sale-message:', err.message);
            }
        });

        return;

    } catch (error) {
        console.error('❌ POST /api/chat/send-sale-message:', error);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, message: 'Eroare server.' });
        }
    }
});


export default chatRoute;
