// ============================================================================
//  scripts/diagSubdomain.js
// ----------------------------------------------------------------------------
//  Reproduce exact decizia pe care o ia `resolveParc` pentru un hostname, și
//  arată în ce stare e fiecare verigă din lanț.
//
//  RULARE:
//    node scripts/diagSubdomain.js demo
//    node scripts/diagSubdomain.js demo.car-flip.com
//
//  Răspunde la întrebarea „de ce văd pagina CarFlip pe subdomeniul meu?" fără
//  să fie nevoie să pui console.log-uri în producție.
// ============================================================================

import mongoose from 'mongoose';
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

import parcuri from '../src/models/parcModel.js';
import sales from '../src/models/salesModel.js';
import { isReservedSubdomain, validateSubdomain } from '../src/utils/reservedSubdomains.js';

const ROOT = (process.env.SITE_ROOT_DOMAIN || 'car-flip.com').toLowerCase();
const raw = (process.argv[2] || '').toLowerCase().trim();

const line = (s = '') => console.log(s);
const ok = (s) => line('  ✅ ' + s);
const bad = (s) => line('  ❌ ' + s);
const warn = (s) => line('  ⚠️  ' + s);

if (!raw) {
    console.error('Folosire: node scripts/diagSubdomain.js <subdomeniu>');
    process.exit(1);
}

const sub = raw.endsWith(`.${ROOT}`) ? raw.slice(0, -(ROOT.length + 1)) : raw;

const run = async () => {
    line('══════════════════════════════════════════════════');
    line(`  DIAGNOSTIC: ${sub}.${ROOT}`);
    line('══════════════════════════════════════════════════');
    line();

    // ── 1. Formatul ─────────────────────────────────────────────────────────
    line('1. Format subdomeniu');
    const v = validateSubdomain(sub);
    if (sub.includes('.')) bad('Conține punct → al doilea nivel, neacoperit de SSL. resolveParc dă 404.');
    else if (!v.valid && !isReservedSubdomain(sub)) bad(`Invalid: ${v.error}`);
    else ok('Format valid');

    // ── 2. Lista de rezervate ───────────────────────────────────────────────
    line();
    line('2. Lista de subdomenii rezervate');
    const reserved = isReservedSubdomain(sub);
    if (reserved) {
        warn(`"${sub}" ESTE în lista de rezervate.`);
        line('     Cu versiunea CORECTATĂ a lui resolveParc: dacă parcul există și e');
        line('     activ, se servește oricum. Lista blochează doar CREAREA.');
        line('     Cu versiunea VECHE: request-ul curgea spre pagina CarFlip. ← scurgerea');
    } else {
        ok('Nu e rezervat');
    }

    // ── 3. Baza de date ─────────────────────────────────────────────────────
    line();
    line('3. Parcul în MongoDB');
    await mongoose.connect(process.env.DB_URL);
    const parc = await parcuri.findOne({ subdomain: sub }).lean();

    if (!parc) {
        bad('NU există niciun parc cu acest subdomeniu.');
        const all = await parcuri.find({}).select('subdomain active').lean();
        line(`     Parcuri existente (${all.length}): ` +
             (all.map((p) => p.subdomain + (p.active ? '' : ' [inactiv]')).join(', ') || '—'));
    } else {
        ok(`Găsit: ${parc.display_name}`);
        line(`     _id: ${parc._id}`);
        line(`     user_id: ${parc.user_id}`);
        parc.active ? ok('active: true') : bad('active: FALSE → resolveParc dă 404 stilizat, nu pagina CarFlip.');
        line(`     indexable: ${parc.indexable}`);
        line(`     preset: #${parc.preset} · accent ${parc.accent_color}`);

        const stoc = await sales.countDocuments({ user_id: parc.user_id, is_active: true });
        line(`     mașini active: ${stoc}`);
        if (stoc === 0) warn('Stoc gol — site-ul va arăta starea goală.');
    }

    // ── 4. Cache-ul Redis ───────────────────────────────────────────────────
    line();
    line('4. Cache Redis');
    const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
    try {
        const key = `parc:sub:${sub}`;
        const cached = await r.get(key);
        const ttl = await r.ttl(key);
        if (cached === '__none__') {
            bad(`Cache NEGATIV activ (TTL ${ttl}s).`);
            line('     Backend-ul crede că parcul nu există. Golește-l:');
            line(`       redis-cli DEL ${key}`);
        } else if (cached) {
            const p = JSON.parse(cached);
            ok(`În cache (TTL ${ttl}s): ${p.display_name}, active=${p.active}`);
            if (parc && p.active !== parc.active) {
                bad('Cache-ul are ALTĂ valoare pentru `active` decât baza de date!');
                line(`       redis-cli DEL ${key}`);
            }
        } else {
            line('     Fără intrare în cache (normal — se populează la primul request).');
        }
    } catch (e) {
        warn('Redis inaccesibil: ' + e.message + ' — site-urile merg, dar mai lent.');
    }
    r.disconnect();

    // ── 5. Verdictul ────────────────────────────────────────────────────────
    line();
    line('══════════════════════════════════════════════════');
    line('  VERDICT');
    line('══════════════════════════════════════════════════');

    if (!parc) {
        line('  → 404 stilizat (pagina maro). NU pagina CarFlip.');
    } else if (!parc.active) {
        line('  → 404 stilizat. Activează parcul din panoul de admin.');
    } else if (reserved) {
        line('  → Cu resolveParc CORECTAT: site-ul dealerului. ✅');
        line('  → Cu resolveParc VECHI: pagina CarFlip. ← cauza scurgerii tale');
        line();
        line('  Aplică versiunea corectată și fă OBLIGATORIU:');
        line('      pm2 restart backend');
    } else {
        line('  → Site-ul dealerului. ✅');
        line();
        line('  Dacă totuși vezi pagina CarFlip, cauza e în altă parte:');
        line('    a) resolveParc nu e montat, sau e montat DUPĂ indexRoute');
        line('    b) siteRoute e montat DUPĂ indexRoute');
        line('    c) backend-ul nu a fost repornit după ultima modificare');
        line();
        line('  Verifică ordinea din server.js:');
        line('      app.use(resolveParc);');
        line('      app.use(siteApiRoute);');
        line('      app.use(siteSeoRoute);');
        line('      app.use(dealerAdminRoute);');
        line('      app.use(siteRoute);');
        line('      app.use(blockSiteLeak);   ← nou');
        line('      app.use(adminRoute);');
        line('      app.use(indexRoute);      ← ULTIMA, întotdeauna');
    }
    line();

    await mongoose.disconnect();
    process.exit(0);
};

run().catch((err) => {
    console.error('❌ Eroare:', err.message);
    process.exit(1);
});
