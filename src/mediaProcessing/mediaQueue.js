import { Queue } from 'bullmq';
import redisConnection from '../config/redisConfig.js';

// 1. Definim Coada ("Sala de așteptare")
export const mediaQueue = new Queue('MediaProcessingQueue', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3, 
        backoff: {
            type: 'exponential',
            delay: 5000, 
        },
        removeOnComplete: true, 
        // 🔥 FIX 3: Păstrăm maxim 100 de erori în Redis pentru a preveni Memory Overflow în timp
        removeOnFail: { count: 100 } 
    }
});

// 2. Funcția "Ușier" — pentru postare nouă (NEATINSĂ)
export const addMediaToQueue = async (saleId, files, metadata) => {
    try {
        // Serializăm fișierele pentru a proteja memoria Redis
        const serializedFiles = files.map(f => ({
            path: f.path,               
            originalname: f.originalname,
            mimetype: f.mimetype,
            size: f.size
        }));

        const job = await mediaQueue.add('process-announcement', {
            saleId,
            files: serializedFiles, 
            metadata 
        });
        return job;
    } catch (error) {
        console.error(`❌ Eroare gravă: Nu am putut pune anunțul ${saleId} în coadă.`, error);
        throw error;
    }
};

// ─── NOU: Funcția "Ușier" pentru înlocuirea media la editare ─────────────────
export const addMediaUpdateToQueue = async (saleId, files, oldPublicIds, metadata) => {
    try {
        // Serializăm fișierele identic cu addMediaToQueue
        const serializedFiles = files.map(f => ({
            path: f.path,
            originalname: f.originalname,
            mimetype: f.mimetype,
            size: f.size
        }));

        const job = await mediaQueue.add('process-announcement', {
            saleId,
            files: serializedFiles,
            metadata,
            // ─── Flag care îi spune worker-ului că e un update, nu o postare nouă ───
            isMediaUpdate: true,
            oldPublicIds  // array de string-uri cu public_id-urile de șters după succes
        });

        console.log(`📥 Job UPDATE media adăugat în coadă! ID Anunț: ${saleId} | Job ID: ${job.id}`);
        return job;
    } catch (error) {
        console.error(`❌ Eroare gravă: Nu am putut pune job-ul de update media pentru ${saleId} în coadă.`, error);
        throw error;
    }
};
// ─────────────────────────────────────────────────────────────────────────────