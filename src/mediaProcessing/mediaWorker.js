import { Worker } from 'bullmq';
import redisConnection from '../config/redisConfig.js';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs-extra';
import path from 'path';
import sales from '../models/salesModel.js'; 
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'; 
import * as tf from '@tensorflow/tfjs-node';
import nsfwjsModule from 'nsfwjs';
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

// ─── Prag de „înălțime" (height/width) peste care o imagine primește cover
//     automat (cover_fraction = 1). TREBUIE să rămână identic cu pragul folosit
//     în preview (PreviewItem.jsx → defaultFraction). Folosit DOAR ca fallback,
//     când clientul nu a trimis un cover_fraction (ex: slide nemontat în preview).
const COVER_TALLNESS_THRESHOLD = 1.34;

// ============================================================================
//  NSFW — filtru de conținut (FAIL-OPEN TOTAL)
// ----------------------------------------------------------------------------
//  Rulează ca pre-pass ÎNAINTE de procesare/upload, în ambele ramuri. Modulul
//  e construit ca să NU poată arunca niciodată o eroare în job: întoarce
//  'block' | 'pass' | 'skip'. Doar 'block' oprește un anunț; orice eroare,
//  timeout sau model indisponibil → 'skip' → anunțul se publică normal.
//  Cel mai rău caz posibil: NSFW-ul nu rulează pentru un anunț. Niciodată crash.
// ============================================================================
const NSFW_PORN_THRESHOLD   = 0.8;   // block dacă Porn   >= 0.8
const NSFW_HENTAI_THRESHOLD = 0.8;   // block dacă Hentai >= 0.8  (Sexy ignorat complet)
const NSFW_TIMEOUT_MS       = 30000; // buget global pe tot pasul NSFW, per job
const NSFW_FRAME_FPS        = 1;     // 1 cadru / secundă din video
const NSFW_FRAME_SIZE       = 512;   // imaginile/cadrele scalate la 512px pt. clasificare
const NSFW_MAX_FRAMES       = 60;    // plafon de siguranță la extragerea de cadre

const NSFW_FRAME_BASE = path.join(process.cwd(), 'temp_uploads', 'nsfw_frames');
fs.ensureDirSync(NSFW_FRAME_BASE);

let nsfwModel = null;
let nsfwReady = false;

// Încărcăm modelul O SINGURĂ DATĂ la pornirea worker-ului. Dacă eșuează,
// nsfwReady rămâne false → toate joburile sar peste NSFW (fail-open).
console.log('🔄 ÎNAINTE DE IIFE');
(async () => {
    console.log('🔄 NSFW: backend TF:', tf.getBackend());
    try {
        const modelPath = `file://${path.join(process.cwd(), 'node_modules/nsfwjs/dist/models/mobilenet_v2/model.min.js')}`;
        console.log('🔄 NSFW: încarc modelul din:', modelPath);
        nsfwModel = await nsfwjsModule.load(modelPath);
        nsfwReady = true;
        console.log('✅ NSFW: model încărcat, filtru ACTIV.');
    } catch (err) {
        nsfwReady = false;
        console.error('⚠️ NSFW EROARE COMPLETĂ:', err);
    }
})();
console.log('🔄 DUPĂ IIFE (sync)');

// Clasifică un buffer JPEG mic. Întoarce true dacă e conținut interzis.
// Eliberează ÎNTOTDEAUNA tensorul (dispose în finally) — fără leak.
const nsfwClassifyBuffer = async (buffer) => {
    let decoded = null;
    try {
        decoded = tf.node.decodeImage(buffer, 3);
        const preds = await nsfwModel.classify(decoded);
        let porn = 0, hentai = 0;
        for (const p of preds) {
            if (p.className === 'Porn') porn = p.probability;
            else if (p.className === 'Hentai') hentai = p.probability;
        }
        return porn >= NSFW_PORN_THRESHOLD || hentai >= NSFW_HENTAI_THRESHOLD;
    } finally {
        if (decoded) decoded.dispose();
    }
};

// Imagine: redimensionăm originalul la 512px (input mic → memorie mărginită),
// apoi clasificăm. .rotate() ca să clasificăm imaginea în orientarea corectă.
const nsfwClassifyImage = async (filePath) => {
    const buf = await sharp(filePath)
        .rotate()
        .resize(NSFW_FRAME_SIZE, NSFW_FRAME_SIZE, { fit: 'inside', withoutEnlargement: true })
        .jpeg()
        .toBuffer();
    return nsfwClassifyBuffer(buf); // true dacă e blocat
};

// Extrage cadre din video cu ffmpeg, cu kill-timer hard pe deadline.
const nsfwExtractFrames = (videoPath, outDir, deadline) => new Promise((resolve, reject) => {
    let settled = false;
    let killer = null;
    const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        if (killer) clearTimeout(killer);
        fn(arg);
    };
    const cmd = ffmpeg(videoPath)
        .outputOptions([
            '-vf', `fps=${NSFW_FRAME_FPS},scale=${NSFW_FRAME_SIZE}:-2`,
            '-frames:v', String(NSFW_MAX_FRAMES),
            '-q:v', '5'
        ])
        .on('end', () => finish(resolve))
        .on('error', (err) => finish(reject, err))
        .save(path.join(outDir, 'frame_%04d.jpg'));

    const ms = Math.max(1000, deadline - Date.now());
    killer = setTimeout(() => {
        try { cmd.kill('SIGKILL'); } catch (e) {}
        finish(reject, new Error('NSFW: timeout la extragerea cadrelor'));
    }, ms);
});

// Video: extrage cadre → clasifică pe rând, early-exit la primul cadru blocat.
// Întoarce 'block' | 'clean' | 'skip'. Curăță ÎNTOTDEAUNA folderul de cadre.
const nsfwClassifyVideo = async (filePath, deadline) => {
    const frameDir = path.join(NSFW_FRAME_BASE, `f_${Date.now()}_${Math.round(Math.random() * 1e9)}`);
    await fs.ensureDir(frameDir);
    try {
        await nsfwExtractFrames(filePath, frameDir, deadline);
        const frames = (await fs.readdir(frameDir)).filter(f => f.endsWith('.jpg')).sort();
        for (const f of frames) {
            if (Date.now() > deadline) return 'skip'; // am depășit bugetul
            const buf = await fs.readFile(path.join(frameDir, f));
            if (await nsfwClassifyBuffer(buf)) return 'block';
        }
        return 'clean';
    } finally {
        await fs.remove(frameDir).catch(() => {});
    }
};

// Parcurge toate fișierele. Întoarce 'block' | 'pass' | 'skip'. Poate arunca
// (apelantul prinde și convertește în 'skip').
const nsfwClassifyAll = async (files, deadline) => {
    for (const file of files) {
        if (Date.now() > deadline) return 'skip';
        const isVideo = file.mimetype && file.mimetype.startsWith('video/');
        if (isVideo) {
            const v = await nsfwClassifyVideo(file.path, deadline);
            if (v === 'block') return 'block';
            if (v === 'skip') return 'skip';
            // 'clean' → continuăm cu următorul fișier
        } else {
            if (await nsfwClassifyImage(file.path)) return 'block';
        }
    }
    return 'pass';
};

// Punctul de intrare. NU aruncă NICIODATĂ. Întoarce 'block' | 'pass' | 'skip'.
const runNsfwCheck = async (files) => {
    if (!nsfwReady || !nsfwModel) {
        console.log('🟡 NSFW: skip — model indisponibil (fail-open).');
        return 'skip';
    }
    const deadline = Date.now() + NSFW_TIMEOUT_MS;
    try {
        return await nsfwClassifyAll(files, deadline);
    } catch (err) {
        console.log('🟡 NSFW: skip — eroare în clasificare (fail-open):', err?.message || err);
        return 'skip';
    }
};
// ============================================================================

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

            // ─── NSFW pre-pass (NOU) ─────────────────────────────────────────
            // La editare, pe 'block' PĂSTRĂM media veche (nu facem swap). Doar
            // pe prima încercare (skip-on-retry). Fail-open total.
            if (job.attemptsMade === 0) {
                const nsfwVerdict = await runNsfwCheck(files);
                if (nsfwVerdict === 'block') {
                    console.log(`🚫 NSFW: editarea anunțului ${saleId} conține conținut interzis — păstrăm media veche.`);
                    for (const file of files) {
                        await fs.unlink(file.path).catch(() => {});
                    }
                    return; // anunțul rămâne neatins (media veche); job cu succes, fără retry
                }
                console.log(`✅ NSFW: editarea ${saleId} → ${nsfwVerdict}.`);
            }
            // ─────────────────────────────────────────────────────────────────

            // Procesăm fișierele noi — identic cu fluxul normal
            for (const [index, file] of files.entries()) {
                const isVideo = file.mimetype.startsWith('video/');

                const processedFileName = `processed_${Date.now()}_${Math.round(Math.random() * 1E9)}${isVideo ? '.mp4' : '.jpg'}`;
                const processedFilePath = path.join(readyDirPath, processedFileName);

                createdTempFiles.push(processedFilePath);

                let sharpInfo = null;

                if (isVideo) {
                    const probeData = await new Promise((resolve, reject) => {
                        ffmpeg.ffprobe(file.path, (err, data) => err ? reject(err) : resolve(data));
                    });

                    if (probeData.format.duration > 45) {
                        throw new Error(`VIDEO_TOO_LONG: ${file.originalname} (${Math.round(probeData.format.duration)}s). Maxim 45s permis.`);
                    }

                    await processVideo(file.path, processedFilePath);
                } else {
                    let img = sharp(file.path).rotate();
                    sharpInfo = await img
                        .resize({ 
                            width: 1440, 
                            height: 1440, 
                            fit: 'inside',
                            withoutEnlargement: true
                        })
                        .jpeg({ quality: 76, progressive: true, mozjpeg: true, chromaSubsampling: '4:2:0' })
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
                const currentCoverFraction = metadata[index]?.cover_fraction;

                const mediaEntry = {
                    url: `${process.env.R2_PUBLIC_DOMAIN}/${processedFileName}`,
                    type: isVideo ? 'video' : 'image',
                    public_id: processedFileName,
                    zoom_level: currentZoom
                };

                // ─── 1. Întâi atașăm dimensiunile fișierului PROCESAT (orientat fizic) ──
                //    Sunt exact dimensiunile pe care le va afișa feed-ul.
                if (isVideo) {
                    const videoDimensions = await probeVideoDimensions(processedFilePath);
                    if (videoDimensions) {
                        mediaEntry.width = videoDimensions.width;
                        mediaEntry.height = videoDimensions.height;
                    }
                } else {
                    if (sharpInfo && sharpInfo.width && sharpInfo.height) {
                        mediaEntry.width = sharpInfo.width;
                        mediaEntry.height = sharpInfo.height;
                    }
                }

                // ─── 2. cover_fraction ────────────────────────────────────────
                //    - trimis de client (auto din preview SAU slider) → îl respectăm;
                //    - lipsă (slide nemontat în preview) → îl calculăm AICI din
                //      dimensiunile reale, identic cu logica din preview.
                //    Doar pentru imagini — video-ul nu folosește cover_fraction în feed.
                if (typeof currentCoverFraction === 'number' && Number.isFinite(currentCoverFraction)) {
                    mediaEntry.cover_fraction = currentCoverFraction;
                } else if (!isVideo && mediaEntry.width > 0 && mediaEntry.height > 0) {
                    const tallness = mediaEntry.height / mediaEntry.width;
                    mediaEntry.cover_fraction = tallness >= COVER_TALLNESS_THRESHOLD ? 1 : 0;
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

        // ─── NSFW pre-pass (NOU) ─────────────────────────────────────────────
        // Rulează ÎNAINTE de procesare/upload, doar pe prima încercare
        // (skip-on-retry). Fail-open total: doar 'block' oprește anunțul; orice
        // altceva ('pass'/'skip') → execuția curge în logica existentă neatinsă.
        if (job.attemptsMade === 0) {
            const nsfwVerdict = await runNsfwCheck(files);
            if (nsfwVerdict === 'block') {
                console.log(`🚫 NSFW: anunțul ${saleId} conține conținut interzis — NU se publică.`);
                await sales.findByIdAndUpdate(saleId, { status: 'failed_media', is_active: false });
                for (const file of files) {
                    await fs.unlink(file.path).catch(() => {});
                }
                return; // job complet cu succes (fără retry); finally curăță temp (gol acum)
            }
            console.log(`✅ NSFW: anunțul ${saleId} → ${nsfwVerdict}.`);
        }
        // ─────────────────────────────────────────────────────────────────────

        for (const [index, file] of files.entries()) {
            const isVideo = file.mimetype.startsWith('video/');
            
            const processedFileName = `processed_${Date.now()}_${Math.round(Math.random() * 1E9)}${isVideo ? '.mp4' : '.jpg'}`;
            const processedFilePath = path.join(readyDirPath, processedFileName);

            // FIX: înregistrăm fișierul ÎNAINTE să îl creăm, ca finally să îl poată șterge
            createdTempFiles.push(processedFilePath);

            let sharpInfo = null;

            if (isVideo) {
                // Validăm durata înainte de procesare
                const probeData = await new Promise((resolve, reject) => {
                    ffmpeg.ffprobe(file.path, (err, data) => err ? reject(err) : resolve(data));
                });
                
                if (probeData.format.duration > 45) {
                    throw new Error(`VIDEO_TOO_LONG: ${file.originalname} (${Math.round(probeData.format.duration)}s). Maxim 45s permis.`);
                }

                await processVideo(file.path, processedFilePath);
            } else {
                // FIX Sharp:
                // .rotate()              → citește EXIF, rotește fizic pixelii, corect pe iOS și Android
                // .resize fit:'inside'   → păstrează aspect ratio exact (4:3 rămâne 4:3, 16:9 rămâne 16:9)
                // fără .withMetadata()   → șterge tot EXIF-ul, inclusiv orientarea (nu mai e nevoie, e rotit fizic)
                let img = sharp(file.path).rotate();
                sharpInfo = await img
                    .resize({ 
                        width: 1440, 
                        height: 1440, 
                        fit: 'inside',
                        withoutEnlargement: true
                    })
                    .jpeg({ quality: 76, progressive: true, mozjpeg: true, chromaSubsampling: '4:2:0' })
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
            const currentCoverFraction = metadata[index]?.cover_fraction;

            const mediaEntry = {
                url: `${process.env.R2_PUBLIC_DOMAIN}/${processedFileName}`,
                type: isVideo ? 'video' : 'image',
                public_id: processedFileName, 
                zoom_level: currentZoom
            };

            // ─── 1. Întâi atașăm dimensiunile fișierului PROCESAT (orientat fizic) ──
            //    Sunt exact dimensiunile pe care le va afișa feed-ul.
            if (isVideo) {
                const videoDimensions = await probeVideoDimensions(processedFilePath);
                if (videoDimensions) {
                    mediaEntry.width = videoDimensions.width;
                    mediaEntry.height = videoDimensions.height;
                }
            } else {
                if (sharpInfo && sharpInfo.width && sharpInfo.height) {
                    mediaEntry.width = sharpInfo.width;
                    mediaEntry.height = sharpInfo.height;
                }
            }

            // ─── 2. cover_fraction ────────────────────────────────────────
            //    - trimis de client (auto din preview SAU slider) → îl respectăm;
            //    - lipsă (slide nemontat în preview) → îl calculăm AICI din
            //      dimensiunile reale, identic cu logica din preview.
            //    Doar pentru imagini — video-ul nu folosește cover_fraction în feed.
            if (typeof currentCoverFraction === 'number' && Number.isFinite(currentCoverFraction)) {
                mediaEntry.cover_fraction = currentCoverFraction;
            } else if (!isVideo && mediaEntry.width > 0 && mediaEntry.height > 0) {
                const tallness = mediaEntry.height / mediaEntry.width;
                mediaEntry.cover_fraction = tallness >= COVER_TALLNESS_THRESHOLD ? 1 : 0;
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


// ─── Worker secundar: clasificare NSFW pentru avatare (coadă separată) ───────
// Rulează în ACELAȘI proces → refolosește modelul deja încărcat (zero RAM în plus).
// Coadă separată → nu așteaptă în spatele joburilor de video.
// Procesorul NU aruncă NICIODATĂ: întoarce 'block' | 'pass' | 'skip' (fail-open).
export const avatarNsfwWorker = new Worker('AvatarNsfwQueue', async job => {
    try {
        if (!nsfwReady || !nsfwModel) return 'skip';
        const buffer = Buffer.from(job.data.image, 'base64');
        const blocked = await nsfwClassifyBuffer(buffer); // decode + classify + dispose (deja există)
        return blocked ? 'block' : 'pass';
    } catch (err) {
        console.log('🟡 NSFW (avatar worker): skip — eroare (fail-open):', err?.message || err);
        return 'skip';
    }
}, {
    connection: redisConnection,
    concurrency: 3 // bandă proprie pentru avatare; nu blochează coada media. Poți pune și 1.
});