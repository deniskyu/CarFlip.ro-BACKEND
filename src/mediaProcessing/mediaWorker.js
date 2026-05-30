import { Worker } from 'bullmq';
import redisConnection from '../config/redisConfig.js';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs-extra';
import path from 'path';
import sales from '../models/salesModel.js'; 
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'; 
//import Stripe from 'stripe';
//const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.DB_URL)
    .then(() => console.log('✅ Worker conectat la MongoDB'))
    .catch(err => console.error('❌ Worker MongoDB error:', err));

import { triggerSearchAlerts } from '../routes/searchAlertsRoute.js'; 

console.log('🚀🚀🚀 mediaWorker.js a fost încărcat la', new Date().toISOString());

const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    }
});

const processVideo = (inputPath, outputPath) => {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                '-threads 1',
                '-vcodec libx264',
                '-crf 24',
                '-preset medium',
                // FIX: un singur filtru care detectează orientarea și scalează corect
                // Landscape → limitează lățimea la 1280, înălțimea auto
                // Portrait  → limitează înălțimea la 720, lățimea auto
                // Al doilea scale forțează dimensiuni pare (cerință obligatorie x264)
                /*'-vf', "scale='if(gte(iw,ih),min(1920,iw),-2)':'if(gte(iw,ih),-2,min(1920,ih))',scale=trunc(iw/2)*2:trunc(ih/2)*2",*/
                '-vf', "scale='if(gte(iw,ih),min(1280,iw),-2)':'if(gte(iw,ih),-2,min(720,ih))',scale=trunc(iw/2)*2:trunc(ih/2)*2",
                '-acodec aac',
                '-b:a 128k',
                '-map_metadata -1',
                '-metadata:s:v:0 rotate=0',
                '-movflags', '+faststart'
            ])
            .save(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', (err) => reject(err));
    });
};

// ─── NOU: Citește dimensiunile width/height ale unui video procesat ──────────
// Rulează pe fișierul OUTPUT (post-ffmpeg), unde rotația e deja aplicată
// fizic și metadata curățată → dimensiunile sunt exact ce va afișa orice
// player, fără ambiguități de orientare.
// Defensive: orice eșec returnează null, NU aruncă — apelantul decide ce face.
const probeVideoDimensions = async (filePath) => {
    console.log(`🔍 probeVideoDimensions: pornire pe ${filePath}`);
    try {
        const probeData = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, data) => err ? reject(err) : resolve(data));
        });
        const videoStream = probeData.streams.find(s => s.codec_type === 'video');
        console.log(`🔍 probeVideoDimensions: videoStream găsit?`, !!videoStream, 'w=', videoStream?.width, 'h=', videoStream?.height);
        if (videoStream && videoStream.width && videoStream.height) {
            return { width: videoStream.width, height: videoStream.height };
        }
        console.log(`🔍 probeVideoDimensions: returnez null (videoStream incomplet)`);
        return null;
    } catch (err) {
        console.warn(`⚠️ Nu am putut citi dimensiunile video pentru ${filePath}:`, err.message);
        return null;
    }
};

export const mediaWorker = new Worker('MediaProcessingQueue', async job => {
    const { saleId, files, metadata = [], isMediaUpdate = false, oldPublicIds = [] } = job.data; 
    const finalMediaUrls = [];
    const createdTempFiles = []; // FIX: track fișiere temporare pentru cleanup garantat

    // ─── Ramura pentru UPDATE media (editare anunț existent) ─────────────────
    if (isMediaUpdate) {

        const readyDirPath = path.join(process.cwd(), 'temp_uploads', 'ready');
        fs.ensureDirSync(readyDirPath);

        try {
            // Verificăm că fișierele originale există pe disk
            for (const file of files) {
                const exists = await fs.pathExists(file.path);
                if (!exists) {
                    throw new Error(`FIȘIER_LIPSĂ: ${file.path} — nu există pe disk. Probabil serverul s-a repornit.`);
                }
            }

            // Procesăm fișierele noi — identic cu fluxul normal
            for (const [index, file] of files.entries()) {
                const isVideo = file.mimetype.startsWith('video/');

                const processedFileName = `processed_${Date.now()}_${Math.round(Math.random() * 1E9)}${isVideo ? '.mp4' : '.jpg'}`;
                const processedFilePath = path.join(readyDirPath, processedFileName);

                createdTempFiles.push(processedFilePath);

                if (isVideo) {
                    const probeData = await new Promise((resolve, reject) => {
                        ffmpeg.ffprobe(file.path, (err, data) => err ? reject(err) : resolve(data));
                    });

                    if (probeData.format.duration > 25) {
                        throw new Error(`VIDEO_TOO_LONG: ${file.originalname} (${Math.round(probeData.format.duration)}s). Maxim 25s permis.`);
                    }

                    await processVideo(file.path, processedFilePath);
                } else {
                    await sharp(file.path)
                        .rotate()
                        .resize({ 
                            width: 1440, 
                            height: 1440, 
                            fit: 'inside',
                            withoutEnlargement: true
                        })
                        .jpeg({ quality: 72, progressive: true, mozjpeg: true, chromaSubsampling: '4:2:0' })
                        .toFile(processedFilePath);
                }

                const fileStream = fs.createReadStream(processedFilePath);
                const fileStats = await fs.stat(processedFilePath);

                await s3.send(new PutObjectCommand({
                    Bucket: process.env.R2_BUCKET_NAME,
                    Key: processedFileName,
                    Body: fileStream,
                    ContentLength: fileStats.size,
                    ContentType: isVideo ? 'video/mp4' : 'image/jpeg'
                }));

                try {
                    await fetch(`${process.env.R2_PUBLIC_DOMAIN}/${processedFileName}`, { method: 'HEAD' });
                } catch (e) {}

                const currentZoom = metadata[index]?.zoom_level || 1;

                const mediaEntry = {
                    url: `${process.env.R2_PUBLIC_DOMAIN}/${processedFileName}`,
                    type: isVideo ? 'video' : 'image',
                    public_id: processedFileName,
                    zoom_level: currentZoom
                };

                // ─── NOU: Pentru video, atașăm dimensiunile fișierului procesat ──
                if (isVideo) {
                    const videoDimensions = await probeVideoDimensions(processedFilePath);
                    if (videoDimensions) {
                        mediaEntry.width = videoDimensions.width;
                        mediaEntry.height = videoDimensions.height;
                    }
                }

                finalMediaUrls.push(mediaEntry);
            }

            console.log('🔍 finalMediaUrls înainte de DB write:', JSON.stringify(finalMediaUrls, null, 2));

            // ── SUCCES: Swap atomic în DB — fără să atingem status sau is_active ──
            await sales.findByIdAndUpdate(
                saleId,
                { $set: { media: finalMediaUrls } },
                { new: true }
            );

            // ── Ștergem pozele vechi din R2 DOAR după ce swap-ul în DB a reușit ──
            for (const publicId of oldPublicIds) {
                await s3.send(new DeleteObjectCommand({
                    Bucket: process.env.R2_BUCKET_NAME,
                    Key: publicId
                })).catch(err => console.warn(`⚠️ Nu am putut șterge ${publicId} din R2:`, err.message));
            }

            // Ștergem fișierele originale de pe disk după succes complet
            for (const file of files) {
                await fs.unlink(file.path).catch(() => {});
            }

        } catch (error) {
            console.error(`❌ Eroare la UPDATE media pentru anunțul ${saleId}:`, error.message);

            const isLastAttempt = job.attemptsMade >= job.opts.attempts - 1;

            if (isLastAttempt) {
                // La eșec final: pozele vechi rămân intacte în DB — anunțul e funcțional
                // Nu facem nimic în DB, nu facem refund/cancel Stripe
                console.log(`🚨 UPDATE media eșuat definitiv pentru ${saleId}. Pozele vechi rămân neatinse în DB.`);

                // Ștergem fișierele originale — nu mai sunt utile
                for (const file of files) {
                    await fs.unlink(file.path).catch(() => {});
                }
            } else {
                console.log(`⚠️ Încercarea ${job.attemptsMade + 1} eșuată pentru UPDATE media ${saleId}. BullMQ va face retry...`);
                // NU ștergem fișierele originale — retry-ul are nevoie de ele
            }

            throw error;

        } finally {
            // Fișierele temporare procesate sunt șterse ÎNTOTDEAUNA
            for (const tmpFile of createdTempFiles) {
                await fs.unlink(tmpFile).catch(() => {});
            }
        }

        return; // Ieșim din worker după ramura de update
    }
    // ─────────────────────────────────────────────────────────────────────────

    const readyDirPath = path.join(process.cwd(), 'temp_uploads', 'ready');
    fs.ensureDirSync(readyDirPath);

    try {
        // FIX: verificăm că fișierele originale există pe disk înainte să începem
        // (pot dispărea dacă serverul s-a repornit între retry-uri)
        for (const file of files) {
            const exists = await fs.pathExists(file.path);
            if (!exists) {
                throw new Error(`FIȘIER_LIPSĂ: ${file.path} — nu există pe disk. Probabil serverul s-a repornit.`);
            }
        }

        for (const [index, file] of files.entries()) {
            const isVideo = file.mimetype.startsWith('video/');
            
            const processedFileName = `processed_${Date.now()}_${Math.round(Math.random() * 1E9)}${isVideo ? '.mp4' : '.jpg'}`;
            const processedFilePath = path.join(readyDirPath, processedFileName);

            // FIX: înregistrăm fișierul ÎNAINTE să îl creăm, ca finally să îl poată șterge
            createdTempFiles.push(processedFilePath);

            if (isVideo) {
                // Validăm durata înainte de procesare
                const probeData = await new Promise((resolve, reject) => {
                    ffmpeg.ffprobe(file.path, (err, data) => err ? reject(err) : resolve(data));
                });
                
                if (probeData.format.duration > 25) {
                    throw new Error(`VIDEO_TOO_LONG: ${file.originalname} (${Math.round(probeData.format.duration)}s). Maxim 25s permis.`);
                }

                await processVideo(file.path, processedFilePath);
            } else {
                // FIX Sharp:
                // .rotate()              → citește EXIF, rotește fizic pixelii, corect pe iOS și Android
                // .resize fit:'inside'   → păstrează aspect ratio exact (4:3 rămâne 4:3, 16:9 rămâne 16:9)
                // fără .withMetadata()   → șterge tot EXIF-ul, inclusiv orientarea (nu mai e nevoie, e rotit fizic)
                await sharp(file.path)
                    .rotate()
                    .resize({ 
                        width: 1440, 
                        height: 1440, 
                        fit: 'inside',
                        withoutEnlargement: true
                    })
                    .jpeg({ quality: 72, progressive: true, mozjpeg: true, chromaSubsampling: '4:2:0' })
                    .toFile(processedFilePath);
            }
            
            const fileStream = fs.createReadStream(processedFilePath);
            const fileStats = await fs.stat(processedFilePath);
            
            await s3.send(new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: processedFileName,
                Body: fileStream, 
                ContentLength: fileStats.size,
                ContentType: isVideo ? 'video/mp4' : 'image/jpeg'
            }));

            try {
                await fetch(`${process.env.R2_PUBLIC_DOMAIN}/${processedFileName}`, { method: 'HEAD' });
            } catch (e) {}

            const currentZoom = metadata[index]?.zoom_level || 1;

            const mediaEntry = {
                url: `${process.env.R2_PUBLIC_DOMAIN}/${processedFileName}`,
                type: isVideo ? 'video' : 'image',
                public_id: processedFileName, 
                zoom_level: currentZoom
            };

            // ─── NOU: Pentru video, atașăm dimensiunile fișierului procesat ──
            if (isVideo) {
                const videoDimensions = await probeVideoDimensions(processedFilePath);
                if (videoDimensions) {
                    mediaEntry.width = videoDimensions.width;
                    mediaEntry.height = videoDimensions.height;
                }
            }

            finalMediaUrls.push(mediaEntry);
        }

        // Update atomic în DB
        const updatedSale = await sales.findByIdAndUpdate(
            saleId,
            [{ 
                $set: {
                    media: finalMediaUrls,
                    status: {
                        $cond: {
                            if: { $eq: ['$status', 'media_processing'] },
                            then: 'active',
                            else: '$status'
                        }
                    },
                    is_active: {
                        $cond: {
                            if: { $eq: ['$status', 'media_processing'] },
                            then: true,
                            else: '$is_active'
                        }
                    }
                }
            }],
            { new: true, updatePipeline: true }
        );

        if (updatedSale && updatedSale.status === 'active' && updatedSale.is_active && !updatedSale.alerts_sent) {
            await sales.findByIdAndUpdate(saleId, { alerts_sent: true });
            triggerSearchAlerts(updatedSale).catch(err => console.error(`eroare la trimiterea notificarile alerte: ${err}`));
        }

        // Ștergem fișierele ORIGINALE doar la succes complet
        for (const file of files) {
            await fs.unlink(file.path).catch(() => {});
        }

    } catch (error) {
        console.error(`❌ Eroare la procesarea anunțului ${saleId}:`, error.message);
        
        const isLastAttempt = job.attemptsMade >= job.opts.attempts - 1;

        if (isLastAttempt) {
            console.log(`🚨 Ultima încercare a eșuat pentru ${saleId}. Inițiem anularea și refund-ul.`);

            await sales.findByIdAndUpdate(saleId, { 
                status: 'failed_media', 
                is_active: false
            });

            const failedSale = await sales.findById(saleId); 
            
            /*if (failedSale && failedSale.stripe_subscription_id) {
                try {
                    console.log(`💰 Inițiem refund pentru subscripția: ${failedSale.stripe_subscription_id}`);
                    
                    const subscription = await stripe.subscriptions.retrieve(failedSale.stripe_subscription_id);
                    const lastInvoiceId = subscription.latest_invoice;
            
                    if (lastInvoiceId) {
                        const invoice = await stripe.invoices.retrieve(lastInvoiceId);
                        const paymentIntentId = invoice.payment_intent;
            
                        // Refund separat — nu blochează cancel-ul dacă eșuează
                        if (paymentIntentId) {
                            try {
                                const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
                                if (pi.status === 'succeeded') {
                                    await stripe.refunds.create({
                                        payment_intent: paymentIntentId,
                                        reason: 'requested_by_customer'
                                    });
                                    console.log(`✅ Refund trimis cu succes pentru ${saleId}.`);
                                } else {
                                    console.log(`ℹ️ PaymentIntent nu e succeeded (status: ${pi.status}), refund skip.`);
                                }
                            } catch (refundErr) {
                                // Refund-ul a eșuat, dar cancel-ul trebuie să ruleze oricum
                                console.error(`⚠️ Refund eșuat pentru ${saleId}:`, refundErr.message);
                            }
                        } else {
                            // SetupIntent flow (prima factură 0 RON) — nu există PaymentIntent, nu e nimic de refundat
                            console.log(`ℹ️ Fără PaymentIntent pe factură (posibil SetupIntent). Refund skip, mergem la cancel.`);
                        }
                    }
            
                    // Cancel-ul rulează ÎNTOTDEAUNA, indiferent ce s-a întâmplat mai sus
                    try {
                        await stripe.subscriptions.cancel(failedSale.stripe_subscription_id);
                        console.log(`✅ Subscripție anulată pentru ${saleId}.`);
                    } catch (cancelErr) {
                        console.error(`⚠️ Cancel subscripție eșuat pentru ${saleId}:`, cancelErr.message);
                    }
            
                } catch (stripeErr) {
                    console.error("⚠️ Eroare generală la operațiunile Stripe:", stripeErr.message);
                }
            }*/

            // Ștergem și fișierele originale la ultima încercare eșuată — nu mai sunt utile
            for (const file of files) {
                await fs.unlink(file.path).catch(() => {});
            }
        } else {
            console.log(`⚠️ Încercarea ${job.attemptsMade + 1} eșuată pentru ${saleId}. BullMQ va face retry...`);
            // NU ștergem fișierele originale — retry-ul are nevoie de ele
        }
        
        throw error; 
    
    } finally {
        // FIX: indiferent de succes sau eroare, fișierele temporare procesate sunt șterse ÎNTOTDEAUNA
        for (const tmpFile of createdTempFiles) {
            await fs.unlink(tmpFile).catch(() => {});
        }
    }
    // ─────────────────────────────────────────────────────────────────────────

}, { 
    connection: redisConnection,
    concurrency: 1 
});