import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

// ============================================================================
//  src/config/redisCache.js
// ----------------------------------------------------------------------------
//  Conexiune Redis DEDICATĂ pentru cache-ul de parcuri și pentru rate limiterele
//  site-urilor. Deliberat separată de `redisConfig.js`.
//
//  De ce nu refolosim conexiunea existentă:
//   • `redisConfig.js` are `maxRetriesPerRequest: null`, obligatoriu pentru
//     BullMQ, dar exact greșit pentru cache. Acolo vrem ca o comandă să eșueze
//     rapid dacă Redis nu răspunde, nu să aștepte la nesfârșit — un GET blocat
//     ar ține un request de pagină ostatic.
//   • BullMQ folosește comenzi blocante pe conexiunea lui în procesul worker.
//     Amestecul e o sursă clasică de bug-uri greu de diagnosticat.
//
//  O SINGURĂ conexiune pentru cache + rate limit, nu două. La 12 instanțe PM2
//  fiecare conexiune în plus se înmulțește cu 12.
//
//  REGULA DE AUR: dacă Redis pică, site-urile TREBUIE să meargă mai departe,
//  doar mai lent (direct din Mongo). Toate apelurile către clientul ăsta sunt
//  învelite în try/catch de către cei care îl folosesc. Nu se aruncă niciodată
//  în sus o eroare de cache.
// ============================================================================

const redisCache = new Redis(process.env.REDIS_URL, {
    // Eșuăm repede: mai bine lovim Mongo decât să ținem request-ul blocat.
    maxRetriesPerRequest: 2,
    connectTimeout: 3000,
    enableReadyCheck: true,
    enableOfflineQueue: true, // fără coadă când conexiunea e jos → eroare imediată
    retryStrategy: (times) => Math.min(times * 200, 5000),
});

// Fără listener pe 'error', ioredis aruncă unhandled error events care pot
// omorî procesul. Logăm rar ca să nu inundăm log-urile în timpul unei pene.
let lastErrorLog = 0;
redisCache.on('error', (err) => {
    const now = Date.now();
    if (now - lastErrorLog > 30000) {
        lastErrorLog = now;
        console.error('❌ Redis (cache) error:', err.message);
    }
});

redisCache.on('connect', () => console.log('✅ Redis (cache) conectat'));

export default redisCache;
