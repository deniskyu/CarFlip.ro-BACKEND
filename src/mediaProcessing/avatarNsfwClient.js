import { Queue, QueueEvents } from 'bullmq';
import redisConnection from '../config/redisConfig.js';

// ── Coadă DEDICATĂ pentru clasificarea NSFW a avatarelor ─────────────────────
// Separată de coada media → avatarele NU așteaptă în spatele joburilor de video.
const AVATAR_QUEUE = 'AvatarNsfwQueue';

// Cât așteptăm verdictul înainte să dăm fail-open. Cazul normal e ~200-400ms;
// timeout-ul contează doar dacă worker-ul e complet jos. Tunabil.
const AVATAR_NSFW_TIMEOUT_MS = 8000;

// ── Singletons la nivel de modul: create O SINGURĂ DATĂ per proces, NU per
//    request → fără scurgeri de conexiuni Redis, fără setup repetat.
const avatarQueue = new Queue(AVATAR_QUEUE, { connection: redisConnection });
const avatarQueueEvents = new QueueEvents(AVATAR_QUEUE, { connection: redisConnection });

// Întoarce 'block' | 'pass' | 'skip'. NU aruncă NICIODATĂ (fail-open total):
// orice timeout / eroare / verdict necunoscut → 'skip' → apelantul urcă poza normal.
export async function checkAvatar(buffer) {
    try {
        const job = await avatarQueue.add(
            'classify',
            { image: buffer.toString('base64') },
            {
                attempts: 1,                   // fără retry — fail-open se ocupă
                removeOnComplete: { age: 60 }, // păstrăm 60s ca waitUntilFinished să citească sigur rezultatul, apoi auto-curățare
                removeOnFail: { age: 60 },
            }
        );

        // Așteptăm rezultatul ACESTUI job anume (după ID) → fără cross-talk între
        // upload-uri simultane. Timeout sau job eșuat → throw → prins mai jos.
        const verdict = await job.waitUntilFinished(avatarQueueEvents, AVATAR_NSFW_TIMEOUT_MS);

        return (verdict === 'block' || verdict === 'pass' || verdict === 'skip') ? verdict : 'skip';
    } catch (err) {
        console.log('🟡 NSFW (avatar): skip — timeout/eroare la coadă (fail-open):', err?.message || err);
        return 'skip';
    }
}