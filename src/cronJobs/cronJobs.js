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

//const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
                console.log(`📢 ${graceSales.length} notificări grace period trimise.`);
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

    // Curăță conversațiile rămase fără niciun mesaj (orfane după TTL MongoDB)
    cron.schedule('50 3 * * *', async () => {
        try {
        // ─── Curățare imagini chat din R2 ────────────────────────────────────
            const now = new Date();
            const expiredImages = await Message.find({
                type: 'image',
                expires_at: { $lte: now },
                image_public_id: { $ne: null }
            }).select('image_public_id').lean();
    
            if (expiredImages.length > 0) {
                const imgChunks = chunkArray(expiredImages.map(m => m.image_public_id), 50);
                for (const chunk of imgChunks) {
                    await Promise.all(chunk.map(key =>
                        r2.send(new DeleteObjectCommand({
                            Bucket: process.env.R2_BUCKET_NAME,
                            Key: key
                        })).catch(() => {})
                    ));
                }
                console.log(`✅ Imagini chat expirate șterse din R2: ${expiredImages.length}`);
            }
    
            const deletedMessages = await Message.deleteMany({ expires_at: { $lte: now } });
            console.log(`✅ Mesaje expirate șterse din DB: ${deletedMessages.deletedCount}`);
            // ─────────────────────────────────────────────────────────────────────
    
            const allConversations = await Conversation.find({}).select('_id').lean();
            const withMessagesResult = await Message.aggregate([
                { $group: { _id: '$conversation_id' } }
            ]);
            const withMessages = new Set(withMessagesResult.map(r => r._id.toString()));
            const emptyConvIds = allConversations
                .filter(c => !withMessages.has(c._id.toString()))
                .map(c => c._id);
    
            if (emptyConvIds.length > 0) {
                await Conversation.deleteMany({ _id: { $in: emptyConvIds } });
            }
    
            console.log(`✅ Conversații orfane curățate: ${emptyConvIds.length}`);
        } catch (err) {
            console.error('❌ Eroare cron chat cleanup:', err);
        }
    }, { scheduled: true, timezone: 'Europe/Bucharest' });

    // ─── Adaugă 2 views fiecărui anunț activ, din oră în oră ─────────────
    cron.schedule('0 * * * *', async () => {
        try {
            const result = await sales.updateMany(
                { is_active: true },
                { $inc: { views: 2 } },
                { timestamps: false }   // nu bruiem updatedAt cu views sintetice
            );
            console.log(`👁️ Views +2 adăugate la ${result.modifiedCount} anunțuri active.`);
        } catch (err) {
            console.error('❌ Eroare cron adăugare views:', err);
        }
    }, { scheduled: true, timezone: 'Europe/Bucharest' });

};

export default startCronJobs;
