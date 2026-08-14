import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisCache from '../config/redisCache.js';

// ============================================================================
//  src/utils/rateLimiters.js
// ----------------------------------------------------------------------------
//  Limitatoare pentru partea de site-uri. Separate de cele existente pentru că
//  au un profil de trafic complet diferit.
//
//  `fetchLimiter` (4800 / 15 min) e calibrat pentru un utilizator autentificat
//  din aplicație. Pe un site public, o singură persoană care răsfoiește
//  catalogul generează zeci de request-uri, iar în spatele unui NAT (firmă,
//  operator mobil) zeci de vizitatori împart același IP. Aplicat pe site,
//  ar bloca vizitatori reali.
//
//  Invers, pe login-ul dealerului vrem ceva MULT mai strict decât `loginLimiter`:
//  un panou de admin public e scanat de boți în câteva zile de la lansare.
// ============================================================================

const store = (prefix) => new RedisStore({
    sendCommand: (...args) => redisCache.call(...args),
    prefix,
});

/**
 * Paginile publice ale site-urilor.
 * Generos intenționat: Cloudflare stă în față, absoarbe boții și servește
 * majoritatea paginilor din cache-ul de edge fără să atingă serverul. Limita
 * asta e o plasă de siguranță pentru ce trece de Cloudflare, nu prima linie
 * de apărare.
 */
export const siteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 3000,
    legacyHeaders: false,
    standardHeaders: 'draft-7',
    store: store('r1:site:'),
    // Dacă Redis pică, limiterul nu are voie să blocheze tot traficul.
    skip: () => redisCache.status !== 'ready',
    message: { success: false, message: 'Prea multe cereri. Încearcă din nou în câteva minute.' },
});

/**
 * Login-ul din panoul dealerului (`/admin`).
 * Foarte strict: 8 încercări la 15 minute per IP.
 */
export const dealerLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    legacyHeaders: false,
    standardHeaders: 'draft-7',
    store: store('r1:dealer:login:'),
    skip: () => redisCache.status !== 'ready',
    message: { success: false, message: 'Prea multe încercări de autentificare. Reîncearcă peste 15 minute.' },
});

/**
 * Acțiunile din panoul dealerului, după autentificare.
 * Suficient pentru un om care lucrează normal, dar limitează dezastrul dacă o
 * sesiune e furată.
 */
export const dealerActionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 400,
    legacyHeaders: false,
    standardHeaders: 'draft-7',
    store: store('r1:dealer:action:'),
    skip: () => redisCache.status !== 'ready',
    message: { success: false, message: 'Prea multe acțiuni. Încearcă din nou în câteva minute.' },
});

export default { siteLimiter, dealerLoginLimiter, dealerActionLimiter };
