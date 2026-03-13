import admin from '../firebase/firebase.js';
import users from '../models/userModel.js';
import Notifications from '../models/notificationModel.js';
import Conversation from '../models/conversationModel.js';

export const sendAndSaveNotification = async (recipientIds, payloadData, senderData = null) => {
    try {
        if (!recipientIds || recipientIds.length === 0) return;

        if (payloadData.type !== 'NEW_MESSAGE') {
            const dbNotifications = recipientIds.map(userId => ({
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
        }

        for (const recipientId of recipientIds) {
            const targetUser = await users.findById(recipientId).select('refreshTokens').lean();
            if (!targetUser?.refreshTokens?.length) continue;

            const fcmTokens = [...new Set(
                targetUser.refreshTokens
                    .map(s => s.fcmToken)
                    .filter(Boolean)
            )];
            if (fcmTokens.length === 0) continue;

            const unreadNotifCount = await Notifications.countDocuments({
                user_id: recipientId,
                is_read: false
            });

            const userConversations = await Conversation.find({ participants: recipientId }).select('unread_counts').lean();
            let unreadChatTotal = 0;
            for (const conv of userConversations) {
                const countVal = conv.unread_counts instanceof Map
                    ? conv.unread_counts.get(recipientId.toString())
                    : conv.unread_counts?.[recipientId.toString()];
                unreadChatTotal += (countVal || 0);
            }

            const badgeCount = unreadNotifCount + unreadChatTotal;

            const messagePayload = {
                notification: {
                    title: payloadData.title,
                    body: payloadData.body
                },
                android: {
                    notification: {
                        channelId: 'default',
                        priority: 'high',
                        visibility: 'public',
                    }
                },
                apns: {
                    payload: {
                        aps: {
                            sound: 'default',
                            badge: badgeCount,
                        }
                    }
                },
                data: {
                    type: payloadData.type,
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
                            console.error(`❌ FCM token eșuat [${tokenChunk[idx]}]:`, r.error?.code);
                            if (r.error?.code === 'messaging/registration-token-not-registered') {
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
                    console.error('❌ FCM sendEachForMulticast eroare:', fcmErr);
                }
            }
        }

    } catch (error) {
        console.error("Eroare in notificationService:", error);
    }
};