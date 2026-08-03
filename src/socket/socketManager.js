import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import users from '../models/userModel.js';
import { sendAndSaveNotification } from '../services/notificationService.js';
dotenv.config();

let redisClient = null;

let ioInstance = null;
export const getIO = () => ioInstance;

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

export const computeUnreadTotal = async (userId) => {
    try {
        if (!isValidId(userId)) return null;
        const key = String(userId);

        const [currentUser, conversations] = await Promise.all([
            users.findById(userId).select('blocking blocked_by').lean(),
            Conversation.find({
                participants: userId,
                deleted_by: { $ne: userId }
            }).select('participants unread_counts').lean()
        ]);

        if (!currentUser) return null;

        const blockedIds = new Set([
            ...(currentUser.blocking || []).map(id => String(id)),
            ...(currentUser.blocked_by || []).map(id => String(id))
        ]);

        let total = 0;
        for (const conv of conversations) {
            const other = (conv.participants || []).find(p => String(p) !== key);
            if (other && blockedIds.has(String(other))) continue;
            total += readUnreadValue(conv.unread_counts, key);
        }

        return total < 0 ? 0 : total;
    } catch (err) {
        console.error('❌ computeUnreadTotal:', err.message);
        return null;
    }
};

export const emitUnreadTotal = async (userId) => {
    try {
        const io = getIO();
        if (!io || !isValidId(userId)) return;
        const total = await computeUnreadTotal(userId);
        if (total === null) return;
        io.to(`user_${String(userId)}`).emit('unread_count_updated', { total });
    } catch (err) {
        console.error('❌ emitUnreadTotal:', err.message);
    }
};

export const emitConversationUpdate = (conversationId, payload) => {
    try {
        const io = getIO();
        if (!io || !conversationId) return;
        io.to(`conv_${String(conversationId)}`).emit('conversation_updated', Object.assign({
            conversationId: String(conversationId),
            unreadIncrement: 1,
            silent: false,
        }, payload || {}));
    } catch (err) {
        console.error('❌ emitConversationUpdate:', err.message);
    }
};

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

const allowEvent = (socket, key, max, windowMs) => {
    try {
        const now = Date.now();
        if (!socket.data) socket.data = {};
        if (!socket.data.rateBuckets) socket.data.rateBuckets = {};
        const bucket = socket.data.rateBuckets[key];
        if (!bucket || (now - bucket.start) > windowMs) {
            socket.data.rateBuckets[key] = { start: now, count: 1 };
            return true;
        }
        if (bucket.count >= max) return false;
        bucket.count += 1;
        return true;
    } catch (err) {
        return true;
    }
};

const ensureConversationRoom = async (socket, userId, conversationId) => {
    const room = `conv_${conversationId}`;
    if (socket.rooms.has(room)) return true;
    const conversation = await isParticipant(conversationId, userId);
    if (!conversation) return false;
    await socket.join(room);
    return true;
};

const isParticipant = async (conversationId, userId) => {
    if (!isValidId(conversationId) || !isValidId(userId)) return null;
    try {
        return await Conversation.findOne({
            _id: conversationId,
            participants: userId
        }).select('participants').lean();
    } catch (err) {
        return null;
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
        transports: ['websocket', 'polling'],
        maxHttpBufferSize: 1e6
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
    } catch (err) {
        console.error('❌ Eroare la conectarea Redis Adapter pentru Socket.io:', err.message);
    }

    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) return next(new Error('TOKEN_MISSING'));
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (!decoded?.id || !isValidId(decoded.id)) return next(new Error('TOKEN_INVALID'));
            socket.userId = String(decoded.id);
            next();
        } catch (err) {
            return next(new Error('TOKEN_INVALID'));
        }
    });

    io.on('connection', async (socket) => {
        const userId = socket.userId;

        await addOnlineUser(userId, socket.id);
        await socket.join(`user_${userId}`);

        try {
            const conversations = await Conversation.find({
                participants: userId,
                deleted_by: { $ne: userId }
            }).select('_id').lean();

            for (const conv of conversations) {
                await socket.join(`conv_${String(conv._id)}`);
            }
        } catch (err) {
            console.error(`❌ Eroare la join conversații pentru ${userId}:`, err.message);
        }

        socket.on('send_message', async (data, callback) => {
            try {
                if (!allowEvent(socket, 'send_message', 30, 10000)) {
                    return callback?.({ success: false, message: 'Prea multe mesaje. Așteaptă puțin.' });
                }

                const conversationId = data?.conversationId ? String(data.conversationId) : null;
                const rawText = typeof data?.text === 'string' ? data.text : '';
                const clientId = data?.clientId ? String(data.clientId).slice(0, 64) : null;
                const text = rawText.trim();

                if (!conversationId || !isValidId(conversationId) || !text) {
                    return callback?.({ success: false, message: 'Date incomplete.' });
                }

                if (text.length > 1000) {
                    return callback?.({ success: false, message: 'Mesajul depășește 1000 de caractere.' });
                }

                const conversation = await isParticipant(conversationId, userId);

                if (!conversation) {
                    return callback?.({ success: false, message: 'Conversație negăsită.' });
                }

                const recipientId = (conversation.participants || [])
                    .map(p => String(p))
                    .find(p => p !== userId);

                if (!recipientId) {
                    return callback?.({ success: false, message: 'Recipient negăsit.' });
                }

                const senderUser = await users.findById(userId).select('blocking blocked_by username icon').lean();
                if (!senderUser) return callback?.({ success: false, message: 'Utilizator negăsit.' });

                const isBlocked =
                    senderUser.blocking?.some(id => String(id) === recipientId) ||
                    senderUser.blocked_by?.some(id => String(id) === recipientId);

                if (isBlocked) {
                    return callback?.({ success: false, message: 'Nu poți trimite mesaje acestui utilizator.' });
                }

                const newMessage = await Message.create({
                    conversation_id: conversationId,
                    sender_id: userId,
                    type: 'text',
                    text
                });

                const populatedMessage = await Message.findById(newMessage._id)
                    .populate('sender_id', 'username icon')
                    .lean();

                const preview = text.substring(0, 100);
                const now = new Date();

                await Conversation.findByIdAndUpdate(conversationId, {
                    last_message: preview,
                    last_message_type: 'text',
                    last_message_at: now,
                    $inc: { [`unread_counts.${recipientId}`]: 1 },
                    $pull: { deleted_by: { $in: [recipientId, userId] } }
                });

                await socket.join(`conv_${conversationId}`);
                io.in(`user_${recipientId}`).socketsJoin(`conv_${conversationId}`);

                const broadcastMessage = clientId
                    ? Object.assign({}, populatedMessage, { client_id: clientId })
                    : populatedMessage;

                io.to(`conv_${conversationId}`).emit('new_message', broadcastMessage);

                io.to(`conv_${conversationId}`).emit('conversation_updated', {
                    conversationId,
                    senderId: userId,
                    unreadIncrement: 1,
                    silent: false,
                    last_message: preview,
                    last_message_type: 'text',
                    last_message_at: now
                });

                callback?.({ success: true, message: broadcastMessage });

                setImmediate(() => {
                    emitUnreadTotal(recipientId).catch(() => {});

                    sendAndSaveNotification(
                        [recipientId],
                        {
                            type: 'NEW_MESSAGE',
                            title: senderUser?.username || 'Mesaj nou',
                            body: preview,
                            saleId: null,
                            commentId: conversationId
                        },
                        {
                            id: userId,
                            name: senderUser?.username || '',
                            image: senderUser?.icon || ''
                        }
                    ).catch((err) => console.error('❌ FCM send_message:', err.message));
                });

            } catch (err) {
                console.error('❌ Eroare send_message:', err.message);
                callback?.({ success: false, message: 'Eroare server.' });
            }
        });

        socket.on('image_message_sent', async (data) => {
            try {
                if (!allowEvent(socket, 'image_message_sent', 20, 10000)) return;
                const conversationId = data?.conversationId ? String(data.conversationId) : null;
                if (!conversationId) return;
                const conversation = await isParticipant(conversationId, userId);
                if (!conversation) return;
                await socket.join(`conv_${conversationId}`);
            } catch (err) {
                console.error('❌ Eroare image_message_sent:', err.message);
            }
        });

        socket.on('join_conversation', async (conversationId) => {
            try {
                if (!allowEvent(socket, 'join_conversation', 40, 10000)) return;
                const id = conversationId ? String(conversationId) : null;
                if (!id) return;
                await ensureConversationRoom(socket, userId, id);
            } catch (err) {
                console.error('❌ Eroare join_conversation:', err.message);
            }
        });

        socket.on('typing_start', async ({ conversationId } = {}) => {
            try {
                if (!conversationId) return;
                if (!allowEvent(socket, 'typing', 60, 10000)) return;
                const id = String(conversationId);
                const allowed = await ensureConversationRoom(socket, userId, id);
                if (!allowed) return;
                socket.to(`conv_${id}`).emit('typing_start', { userId, conversationId: id });
            } catch (err) {
                console.error('❌ Eroare typing_start:', err.message);
            }
        });

        socket.on('typing_stop', async ({ conversationId } = {}) => {
            try {
                if (!conversationId) return;
                if (!allowEvent(socket, 'typing', 60, 10000)) return;
                const id = String(conversationId);
                const allowed = await ensureConversationRoom(socket, userId, id);
                if (!allowed) return;
                socket.to(`conv_${id}`).emit('typing_stop', { userId, conversationId: id });
            } catch (err) {
                console.error('❌ Eroare typing_stop:', err.message);
            }
        });

        socket.on('mark_read', async (data, callback) => {
            try {
                if (!allowEvent(socket, 'mark_read', 40, 10000)) {
                    return callback?.({ success: false });
                }
                const conversationId = data?.conversationId ? String(data.conversationId) : null;
                if (!conversationId || !isValidId(conversationId)) {
                    return callback?.({ success: false });
                }

                const updated = await Conversation.findOneAndUpdate(
                    { _id: conversationId, participants: userId },
                    { $set: { [`unread_counts.${userId}`]: 0 } }
                ).lean();

                if (!updated) return callback?.({ success: false });

                const result = await Message.updateMany(
                    { conversation_id: conversationId, sender_id: { $ne: userId }, is_read: false },
                    { $set: { is_read: true } }
                );

                if (result?.modifiedCount > 0) {
                    socket.to(`conv_${conversationId}`).emit('messages_read', {
                        conversationId,
                        readBy: userId
                    });
                }

                const unreadTotal = await computeUnreadTotal(userId);

                if (unreadTotal !== null) {
                    io.to(`user_${userId}`).emit('unread_count_updated', { total: unreadTotal });
                }

                callback?.({ success: true, unreadTotal: unreadTotal === null ? undefined : unreadTotal });

            } catch (err) {
                console.error('❌ Eroare mark_read:', err.message);
                callback?.({ success: false });
            }
        });

        socket.on('disconnect', async () => {
            await removeOnlineUser(userId, socket.id);
        });

        socket.on('error', (err) => {
            console.error(`❌ Eroare socket pentru ${userId}:`, err?.message);
        });
    });

    return io;
};

export { isUserOnline };
