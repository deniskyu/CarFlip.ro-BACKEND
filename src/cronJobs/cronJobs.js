import cron from 'node-cron';
import sales from '../models/salesModel.js';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import Comments from '../models/commentModel.js';
import SeenPost from '../models/seenPostsModel.js';
//import Stripe from 'stripe';
import fs from 'fs-extra';
import path from 'path';
import process from 'process';
import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import { sendAndSaveNotification } from '../services/notificationService.js';
import { subMonths } from 'date-fns';
import {
    enqueueSocialCleanupMany,
    dispatchSocialQueue,
    drainSocialCleanup,
    reportSocialHealth,
} from '../services/socialPromo/socialPromoService.js';

//const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const ORPHAN_CONVERSATION_GRACE_HOURS = 24;
const IMAGE_RELEASE_BATCH = 500;
const IMAGE_RELEASE_MAX_BATCHES = 100;
const CONVERSATION_DELETE_BATCH = 500;

const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const chunkArray = (array, size) => {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
};

// Helper pentru a șterge fișiere vechi de pe SSD
const cleanOldTempFiles = async (folderPath) => {
    try {
        const exists = await fs.pathExists(folderPath);
        if (!exists) return;

        const files = await fs.readdir(folderPath);
        const now = Date.now();
        const expirationTime = 24 * 60 * 60 * 1000; // 24 de ore

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            const stats = await fs.stat(filePath);
            if (now - stats.mtimeMs > expirationTime) {
                await fs.remove(filePath);
            }
        }
    } catch (err) {
        console.error(`⚠️ Eroare la curățarea folderului ${folderPath}:`, err);
    }
};

const startCronJobs = () => {
    // Rulează DOAR pe procesul 0 din cluster
    if (process.env.NODE_APP_INSTANCE !== '0' && process.env.NODE_APP_INSTANCE !== undefined) {
        return;
    }

    cron.schedule('0 3 * * *', async () => {
    //cron.schedule('29 16 * * *', async () => {
        try {
            console.log('⏳ Începe Cron Job curățarea generală...');
            const now = new Date();
            const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
            const twoDaysAgo = new Date(now.getTime() - (48 * 60 * 60 * 1000));

            // 1. Trecerea în Grace Period
            const graceResult = await sales.updateMany(
                { is_active: true, paid_until: { $lte: now } },
                { $set: { is_active: false, status: 'grace_period' } }
            );

            // Notificăm proprietarii anunțurilor trecute în grace period
            if (graceResult.modifiedCount > 0) {
                const graceSales = await sales.find({
                    status: 'grace_period',
                    paid_until: { $lte: now, $gte: yesterday },
                }).select('user_id brand model _id').lean();

                for (const sale of graceSales) {
                    await sendAndSaveNotification(
                        [sale.user_id.toString()],
                        {
                            type: 'GRACE_PERIOD',
                            title: 'Anunț expirat',
                            body: `Anunțul "${sale.brand?.name} ${sale.model?.name}" expiră în 10 zile. Intră să-l reactivezi.`,
                            saleId: sale._id.toString(),
                            commentId: null
                        },
                        null
                    );
                }
                console.log(`📨 ${graceSales.length} notificări grace period trimise.`);
            }

            // 2. Identificare anunțuri de șters (Fatality)
            const salesToDelete = await sales.find({
                $or: [
                    { status: 'grace_period', expires_at: { $lte: now } },
                    { status: 'pending_payment', createdAt: { $lte: yesterday } },
                    { status: 'failed_media', updatedAt: { $lte: twoDaysAgo } },
                    { status: 'media_processing', updatedAt: { $lte: yesterday } }
                ]
            });

            if (salesToDelete.length > 0) {
                await enqueueSocialCleanupMany(salesToDelete);

                const mediaToDelete = [];
                const saleIdsToDelete = [];
                //const stripeSubsToCancel = [];

                for (let sale of salesToDelete) {
                    saleIdsToDelete.push(sale._id);
                    if (sale.media && sale.media.length > 0) {
                        for (let mediaItem of sale.media) {
                            if (mediaItem.public_id) mediaToDelete.push(mediaItem.public_id);
                        }
                    }
                    //if (sale.stripe_subscription_id) stripeSubsToCancel.push(sale.stripe_subscription_id);
                }

                /*if (stripeSubsToCancel.length > 0) {
                    const subChunks = chunkArray(stripeSubsToCancel, 20);
                    for (const chunk of subChunks) {
                        await Promise.all(chunk.map(id => stripe.subscriptions.cancel(id).catch(() => {})));
                    }
                }*/

                if (mediaToDelete.length > 0) {
                    const chunks = chunkArray(mediaToDelete, 50);
                    for (const chunk of chunks) {
                        await Promise.all(chunk.map(id =>
                            r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: id })).catch(() => {})
                        ));
                    }
                }

                await Comments.deleteMany({ sale_id: { $in: saleIdsToDelete } });
                await SeenPost.deleteMany({ sale_id: { $in: saleIdsToDelete } });
                await sales.deleteMany({ _id: { $in: saleIdsToDelete } });

                console.log(`✅ Curățenie completă: ${saleIdsToDelete.length} anunțuri șterse.`);
            }

            await cleanOldTempFiles(path.join(process.cwd(), 'temp_uploads', 'raw'));
            await cleanOldTempFiles(path.join(process.cwd(), 'temp_uploads', 'ready'));

        } catch (error) {
            console.error('❌ Eroare gravă în Cron Job:', error);
        }
    }, {
        scheduled: true,
        timezone: 'Europe/Bucharest'
    });

    // Curăță mesajele expirate (30 zile), pozele lor din R2 și conversațiile rămase goale
    cron.schedule('50 3 * * *', async () => {
        try {
            const now = new Date();

            let releasedImages = 0;
            let batches = 0;

            while (batches < IMAGE_RELEASE_MAX_BATCHES) {
                batches += 1;

                const batch = await Message.find({
                    expires_at: { $lte: now },
                    type: 'image',
                    image_public_id: { $ne: null }
                }).select('_id image_public_id').limit(IMAGE_RELEASE_BATCH).lean();

                if (batch.length === 0) break;

                await Promise.all(batch.map(item =>
                    r2.send(new DeleteObjectCommand({
                        Bucket: process.env.R2_BUCKET_NAME,
                        Key: item.image_public_id
                    })).catch(() => {})
                ));

                await Message.updateMany(
                    { _id: { $in: batch.map(item => item._id) } },
                    { $set: { image_public_id: null } }
                );

                releasedImages += batch.length;
            }

            if (releasedImages > 0) {
                console.log(`✅ Imagini chat expirate șterse din R2: ${releasedImages}`);
            }

            const affectedConversationIds = await Message.distinct('conversation_id', {
                expires_at: { $lte: now }
            });

            const deletedMessages = await Message.deleteMany({
                expires_at: { $lte: now },
                $or: [
                    { type: { $ne: 'image' } },
                    { image_public_id: null }
                ]
            });
            console.log(`✅ Mesaje expirate șterse din DB: ${deletedMessages.deletedCount}`);

            if (affectedConversationIds.length > 0) {
                const affectedConversations = await Conversation.find({
                    _id: { $in: affectedConversationIds }
                }).select('participants').lean();

                const unreadBySender = await Message.aggregate([
                    { $match: { conversation_id: { $in: affectedConversationIds }, is_read: false } },
                    { $group: { _id: { conversation: '$conversation_id', sender: '$sender_id' }, total: { $sum: 1 } } }
                ]).allowDiskUse(true);

                const grouped = new Map();
                for (const row of unreadBySender) {
                    const key = String(row._id.conversation);
                    if (!grouped.has(key)) grouped.set(key, new Map());
                    grouped.get(key).set(String(row._id.sender), row.total);
                }

                const operations = [];
                for (const conv of affectedConversations) {
                    const senders = grouped.get(String(conv._id)) || new Map();
                    const counts = {};
                    for (const participant of conv.participants || []) {
                        const key = String(participant);
                        let total = 0;
                        for (const [senderId, amount] of senders) {
                            if (senderId !== key) total += amount;
                        }
                        counts[`unread_counts.${key}`] = total;
                    }
                    if (Object.keys(counts).length > 0) {
                        operations.push({
                            updateOne: { filter: { _id: conv._id }, update: { $set: counts } }
                        });
                    }
                }

                if (operations.length > 0) {
                    const opChunks = chunkArray(operations, CONVERSATION_DELETE_BATCH);
                    for (const chunk of opChunks) {
                        await Conversation.bulkWrite(chunk, { ordered: false });
                    }
                    console.log(`✅ Unread recalculat pentru ${operations.length} conversații.`);
                }
            }

            const orphanCutoff = new Date(Date.now() - ORPHAN_CONVERSATION_GRACE_HOURS * 60 * 60 * 1000);

            const candidateConversations = await Conversation.find({
                createdAt: { $lte: orphanCutoff },
                updatedAt: { $lte: orphanCutoff }
            }).select('_id').lean();

            if (candidateConversations.length > 0) {
                const withMessagesResult = await Message.aggregate([
                    { $group: { _id: '$conversation_id' } }
                ]).allowDiskUse(true);

                const withMessages = new Set(withMessagesResult.map(r => String(r._id)));

                const emptyConvIds = candidateConversations
                    .filter(c => !withMessages.has(String(c._id)))
                    .map(c => c._id);

                if (emptyConvIds.length > 0) {
                    const convChunks = chunkArray(emptyConvIds, CONVERSATION_DELETE_BATCH);
                    for (const chunk of convChunks) {
                        await Conversation.deleteMany({ _id: { $in: chunk } });
                    }
                }

                console.log(`✅ Conversații orfane curățate: ${emptyConvIds.length}`);
            }
        } catch (err) {
            console.error('❌ Eroare cron chat cleanup:', err);
        }
    }, { scheduled: true, timezone: 'Europe/Bucharest' });

    // ─── Adaugă views doar anunțurilor active mai noi de 3 luni ─────────
    cron.schedule('0 * * * *', async () => {
        try {
            const threeMonthsAgo = subMonths(new Date(), 3);

            const result = await sales.updateMany(
                {
                    is_active: true,
                    createdAt: { $gte: threeMonthsAgo }   // ← doar cele din ultimele 3 luni
                },
                { $inc: { views: 1 } },
                { timestamps: false }
            );

            console.log(`👁️ Views +1 la ${result.modifiedCount} anunțuri active (<3 luni).`);
        } catch (err) {
            console.error('❌ Eroare cron adăugare views:', err);
        }
    }, { scheduled: true, timezone: 'Europe/Bucharest' });

    // ─── Dispecerul de postare socială ───────────────────────────────────
    cron.schedule('*/5 * * * *', async () => {
        try {
            await dispatchSocialQueue();
        } catch (err) {
            console.error('❌ Eroare cron social dispatch:', err.message);
        }
    }, { scheduled: true, timezone: 'Europe/Bucharest' });

    // ─── Drenajul cozii de ștergeri sociale ──────────────────────────────
    cron.schedule('*/15 * * * *', async () => {
        try {
            await drainSocialCleanup();
        } catch (err) {
            console.error('❌ Eroare cron social cleanup:', err.message);
        }
    }, { scheduled: true, timezone: 'Europe/Bucharest' });

    // ─── Raport zilnic de sănătate a promovării ──────────────────────────
    cron.schedule('30 9 * * *', async () => {
        try {
            await reportSocialHealth();
        } catch (err) {
            console.error('❌ Eroare cron social health:', err.message);
        }
    }, { scheduled: true, timezone: 'Europe/Bucharest' });

};

export default startCronJobs;
