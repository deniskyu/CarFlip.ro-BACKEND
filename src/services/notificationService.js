import admin from '../firebase/firebase.js';
import users from '../models/userModel.js';
import Notifications from '../models/notificationModel.js';
import Conversation from '../models/conversationModel.js';

const readUnreadValue = (map, key) => {
    if (!map) return 0;
    if (map instanceof Map) return Number(map.get(key)) || 0;
    if (typeof map === 'object') return Number(map[key]) || 0;
    return 0;
};

const countUnreadChats = async (recipientId) => {
    try {
        const key = String(recipientId);
        const conversations = await Conversation.find({
            participants: recipientId,
            deleted_by: { $ne: recipientId }
        }).select('unread_counts').lean();

        let total = 0;
        for (const conv of conversations) {
            total += readUnreadValue(conv.unread_counts, key);
        }
        return total < 0 ? 0 : total;
    } catch (err) {
        console.error('❌ countUnreadChats:', err.message);
        return 0;
    }
};

export const sendAndSaveNotification = async (recipientIds, payloadData, senderData = null) => {
    try {
        if (!Array.isArray(recipientIds) || recipientIds.length === 0) return;
        if (!payloadData || !payloadData.type) return;

        const uniqueRecipients = [...new Set(
            recipientIds.filter(Boolean).map(id => String(id))
        )];

        if (uniqueRecipients.length === 0) return;

        if (payloadData.type !== 'NEW_MESSAGE') {
            try {
                const dbNotifications = uniqueRecipients.map(userId => ({
                    user_id: userId,
                    type: payloadData.type,
                    title: payloadData.title,
                    body: payloadData.body,
                    sale_id: payloadData.saleId || null,
                    comment_id: payloadData.commentId || null,
                    sender_id: senderData ? senderData.id : null,
                    sender_name: senderData ? senderData.name : null,
                    sender_image: senderData ? senderData.image : null,
                    is_read: false
                }));
                await Notifications.insertMany(dbNotifications, { ordered: false });
            } catch (dbErr) {
                console.error('❌ insertMany notificări:', dbErr.message);
            }
        }

        for (const recipientId of uniqueRecipients) {
            try {
                const targetUser = await users.findById(recipientId).select('refreshTokens').lean();
                if (!targetUser?.refreshTokens?.length) continue;

                const fcmTokens = [...new Set(
                    targetUser.refreshTokens
                        .map(s => s?.fcmToken)
                        .filter(token => typeof token === 'string' && token.length > 0)
                )];
                if (fcmTokens.length === 0) continue;

                const [unreadNotifCount, unreadChatTotal] = await Promise.all([
                    Notifications.countDocuments({ user_id: recipientId, is_read: false }),
                    countUnreadChats(recipientId)
                ]);

                const badgeCount = Math.max(0, (Number(unreadNotifCount) || 0) + (Number(unreadChatTotal) || 0));

                const messagePayload = {
                    notification: {
                        title: String(payloadData.title || ''),
                        body: String(payloadData.body || '')
                    },
                    android: {
                        priority: 'high',
                        notification: {
                            channelId: 'default',
                            priority: 'high',
                            visibility: 'public',
                            notificationCount: badgeCount
                        }
                    },
                    apns: {
                        headers: {
                            'apns-priority': '10'
                        },
                        payload: {
                            aps: {
                                sound: 'default',
                                badge: badgeCount,
                            }
                        }
                    },
                    data: {
                        type: String(payloadData.type),
                        saleId: payloadData.saleId ? String(payloadData.saleId) : "",
                        commentId: payloadData.commentId ? String(payloadData.commentId) : ""
                    }
                };

                const chunkSize = 500;
                for (let i = 0; i < fcmTokens.length; i += chunkSize) {
                    const tokenChunk = fcmTokens.slice(i, i + chunkSize);
                    const chunkPayload = { ...messagePayload, tokens: tokenChunk };

                    try {
                        const response = await admin.messaging().sendEachForMulticast(chunkPayload);
                        console.log(`📲 FCM [${payloadData.type}] → ${recipientId}: ${response.successCount} ok, ${response.failureCount} eșuate`);

                        const invalidTokens = [];
                        response.responses.forEach((r, idx) => {
                            if (!r.success) {
                                const code = r.error?.code;
                                console.error(`❌ FCM token eșuat [${tokenChunk[idx]}]:`, code);
                                if (code === 'messaging/registration-token-not-registered'
                                    || code === 'messaging/invalid-registration-token'
                                    || code === 'messaging/invalid-argument') {
                                    invalidTokens.push(tokenChunk[idx]);
                                }
                            }
                        });

                        if (invalidTokens.length > 0) {
                            await users.findByIdAndUpdate(recipientId, {
                                $pull: { refreshTokens: { fcmToken: { $in: invalidTokens } } }
                            });
                            console.log(`🧹 Tokeni invalizi șterși pentru ${recipientId}: ${invalidTokens.length}`);
                        }

                    } catch (fcmErr) {
                        console.error('❌ FCM sendEachForMulticast eroare:', fcmErr.message);
                    }
                }
            } catch (recipientErr) {
                console.error(`❌ Eroare notificare pentru ${recipientId}:`, recipientErr.message);
            }
        }

    } catch (error) {
        console.error("Eroare in notificationService:", error.message);
    }
};
