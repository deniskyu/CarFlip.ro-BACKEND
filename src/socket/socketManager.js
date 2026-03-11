import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import users from '../models/userModel.js';
import { sendAndSaveNotification } from '../services/notificationService.js';
dotenv.config();

let redisClient = null;

let ioInstance = null;
export const getIO = () => ioInstance;

const addOnlineUser = async (userId, socketId) => {
    try {
        if (redisClient) {
            await redisClient.sadd(`online:${userId}`, socketId);
            await redisClient.expire(`online:${userId}`, 3600);
        }
    } catch (err) {
        console.error('❌ Redis addOnlineUser error:', err.message);
    }
};

const removeOnlineUser = async (userId, socketId) => {
    try {
        if (redisClient) {
            await redisClient.srem(`online:${userId}`, socketId);
            const remaining = await redisClient.scard(`online:${userId}`);
            if (remaining === 0) {
                await redisClient.del(`online:${userId}`);
            }
        }
    } catch (err) {
        console.error('❌ Redis removeOnlineUser error:', err.message);
    }
};

const isUserOnline = async (userId) => {
    try {
        if (!redisClient) return false;
        const count = await redisClient.scard(`online:${userId}`);
        return count > 0;
    } catch (err) {
        console.error('❌ Redis isUserOnline error:', err.message);
        return false;
    }
};

export const initSocket = async (httpServer) => {

    const io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        },
        pingInterval: 25000,
        pingTimeout: 20000,
        transports: ['websocket', 'polling']
    });

    ioInstance = io;

    try {
        const pubClient = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: null
        });
        const subClient = pubClient.duplicate();

        pubClient.on('error', (err) => console.error('❌ Redis pub error:', err.message));
        subClient.on('error', (err) => console.error('❌ Redis sub error:', err.message));

        io.adapter(createAdapter(pubClient, subClient));
        redisClient = pubClient;

        console.log('✅ Socket.io Redis Adapter conectat');
    } catch (err) {
        console.error('❌ Eroare la conectarea Redis Adapter pentru Socket.io:', err.message);
    }

    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) return next(new Error('TOKEN_MISSING'));
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.id;
            next();
        } catch (err) {
            return next(new Error('TOKEN_INVALID'));
        }
    });

    io.on('connection', async (socket) => {
        const userId = socket.userId;
        console.log(`🟢 Socket conectat: ${userId} (socket: ${socket.id})`);

        await addOnlineUser(userId, socket.id);
        socket.join(`user_${userId}`);

        try {
            const conversations = await Conversation.find({
                participants: userId,
                deleted_by: { $ne: userId }
            }).select('_id');

            for (const conv of conversations) {
                socket.join(`conv_${conv._id.toString()}`);
            }
        } catch (err) {
            console.error(`❌ Eroare la join conversații pentru ${userId}:`, err.message);
        }

        // ─── EVENT: Trimitere mesaj text ──────────────────────────────────────
        socket.on('send_message', async (data, callback) => {
            try {
                const { conversationId, text } = data;

                if (!conversationId || !text || !text.trim()) {
                    return callback?.({ success: false, message: 'Date incomplete.' });
                }

                if (text.trim().length > 1000) {
                    return callback?.({ success: false, message: 'Mesajul depășește 1000 de caractere.' });
                }

                const conversation = await Conversation.findOne({
                    _id: conversationId,
                    participants: userId
                });

                if (!conversation) {
                    return callback?.({ success: false, message: 'Conversație negăsită.' });
                }

                const recipientId = conversation.participants
                    .find(p => p.toString() !== userId)
                    ?.toString();

                if (!recipientId) {
                    return callback?.({ success: false, message: 'Recipient negăsit.' });
                }

                const senderUser = await users.findById(userId).select('blocking blocked_by').lean();
                if (!senderUser) return callback?.({ success: false, message: 'Utilizator negăsit.' });

                const isBlocked =
                    senderUser.blocking?.some(id => id.toString() === recipientId) ||
                    senderUser.blocked_by?.some(id => id.toString() === recipientId);

                if (isBlocked) {
                    return callback?.({ success: false, message: 'Nu poți trimite mesaje acestui utilizator.' });
                }

                const newMessage = await Message.create({
                    conversation_id: conversationId,
                    sender_id: userId,
                    type: 'text',
                    text: text.trim()
                });

                const populatedMessage = await Message.findById(newMessage._id)
                    .populate('sender_id', 'username icon')
                    .lean();

                await Conversation.findByIdAndUpdate(conversationId, {
                    last_message: text.trim().substring(0, 100),
                    last_message_type: 'text',
                    last_message_at: new Date(),
                    $inc: { [`unread_counts.${recipientId}`]: 1 },
                    $pull: { deleted_by: recipientId }
                });

                socket.join(`conv_${conversationId}`);

                io.to(`conv_${conversationId}`).emit('new_message', populatedMessage);

                socket.to(`conv_${conversationId}`).emit('conversation_updated', {
                    conversationId,
                    last_message: text.trim().substring(0, 100),
                    last_message_type: 'text',
                    last_message_at: new Date()
                });

                // ─── FCM trimis mereu ─────────────────────────────────────────
                // isUserOnline() nu e de încredere pe mobile: socketul rămâne
                // "conectat" în Redis până la 45s după ce userul a închis app-ul.
                // Frontend-ul filtrează corect: onMessage ignoră NEW_MESSAGE în foreground.
                const senderData = await users.findById(userId).select('username icon').lean();
                await sendAndSaveNotification(
                    [recipientId],
                    {
                        type: 'NEW_MESSAGE',
                        title: senderData?.username || 'Mesaj nou',
                        body: text.trim().substring(0, 100),
                        saleId: null,
                        commentId: conversationId
                    },
                    {
                        id: userId,
                        name: senderData?.username || '',
                        image: senderData?.icon || ''
                    }
                );
                // ─────────────────────────────────────────────────────────────

                callback?.({ success: true, message: populatedMessage });

            } catch (err) {
                console.error('❌ Eroare send_message:', err.message);
                callback?.({ success: false, message: 'Eroare server.' });
            }
        });

        // ─── EVENT: Mesaj imagine (fallback socket după upload REST) ─────────
        socket.on('image_message_sent', async (data) => {
            try {
                const { conversationId, messageId } = data;
                if (!conversationId || !messageId) return;
                const conversation = await Conversation.findOne({
                    _id: conversationId,
                    participants: userId
                });
                if (!conversation) return;
                socket.join(`conv_${conversationId}`);
            } catch (err) {
                console.error('❌ Eroare image_message_sent:', err.message);
            }
        });

        // ─── EVENT: Join conversație nouă ────────────────────────────────────
        socket.on('join_conversation', (conversationId) => {
            if (conversationId) socket.join(`conv_${conversationId}`);
        });

        // ─── EVENT: Typing indicator ──────────────────────────────────────────
        socket.on('typing_start', ({ conversationId }) => {
            if (!conversationId) return;
            socket.to(`conv_${conversationId}`).emit('typing_start', { userId, conversationId });
        });

        socket.on('typing_stop', ({ conversationId }) => {
            if (!conversationId) return;
            socket.to(`conv_${conversationId}`).emit('typing_stop', { userId, conversationId });
        });

        // ─── EVENT: Marchează mesaje ca citite ───────────────────────────────
        socket.on('mark_read', async ({ conversationId }) => {
            try {
                if (!conversationId) return;
                await Conversation.findOneAndUpdate(
                    { _id: conversationId, participants: userId },
                    { $set: { [`unread_counts.${userId}`]: 0 } }
                );
                await Message.updateMany(
                    { conversation_id: conversationId, sender_id: { $ne: userId }, is_read: false },
                    { $set: { is_read: true } }
                );
                socket.to(`conv_${conversationId}`).emit('messages_read', {
                    conversationId,
                    readBy: userId
                });
            } catch (err) {
                console.error('❌ Eroare mark_read:', err.message);
            }
        });

        // ─── EVENT: Deconectare ───────────────────────────────────────────────
        socket.on('disconnect', async (reason) => {
            console.log(`🔴 Socket deconectat: ${userId} | Motiv: ${reason}`);
            await removeOnlineUser(userId, socket.id);
        });

        socket.on('error', (err) => {
            console.error(`❌ Eroare socket pentru ${userId}:`, err.message);
        });
    });

    return io;
};

export { isUserOnline };