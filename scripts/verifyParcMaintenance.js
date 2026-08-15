// ============================================================================
//  scripts/verifyParcMaintenance.js
// ----------------------------------------------------------------------------
//  Verifică dacă protecția site-urilor funcționează, indiferent UNDE ai pus-o
//  în cronJobs.js.
//
//  RULARE:
//    node scripts/verifyParcMaintenance.js          → doar raportează
//    node scripts/verifyParcMaintenance.js --run    → rulează efectiv protecția
//
//  Nu inspectează codul, ci EFECTUL: câte anunțuri ale parcurilor active sunt
//  în pericol de expirare. Dacă cronul își face treaba, numărul e zero în
//  fiecare dimineață.
// ============================================================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import sales from '../src/models/salesModel.js';
import parcuri from '../src/models/parcModel.js';

const RUN = process.argv.includes('--run');
const line = (s = '') => console.log(s);
const days = (n) => new Date(Date.now() + n * 86400000);

const run = async () => {
    await mongoose.connect(process.env.DB_URL);

    line('══════════════════════════════════════════════════');
    line('  VERIFICARE PROTECȚIE PARCURI');
    line('══════════════════════════════════════════════════');
    line();

    // ── 1. Modulul există și se poate importa ───────────────────────────────
    line('1. Modulul parcMaintenance.js');
    let mod = null;
    try {
        mod = await import('../src/cronJobs/parcMaintenance.js');
        const fns = ['protectDealerSales', 'reviveDealerSales', 'reportStaleSales', 'reportParcHealth'];
        const missing = fns.filter((f) => typeof mod[f] !== 'function');
        if (missing.length) {
            line(`   ❌ Lipsesc funcțiile: ${missing.join(', ')}`);
        } else {
            line('   ✅ Se importă corect, toate cele 4 funcții există');
        }
    } catch (err) {
        line('   ❌ Nu se poate importa: ' + err.message);
        line('      Verifică dacă fișierul e la src/cronJobs/parcMaintenance.js');
        await mongoose.disconnect();
        process.exit(1);
    }

    // ── 2. Parcuri active ───────────────────────────────────────────────────
    line();
    line('2. Parcuri');
    const active = await parcuri.find({ active: true }).select('subdomain user_id display_name').lean();
    const total = await parcuri.countDocuments({});
    line(`   ${total} parcuri în total · ${active.length} active`);

    if (active.length === 0) {
        line('   ⚠️  Niciun parc activ — nu e nimic de protejat încă.');
        line('      Creează unul și rulează din nou.');
        await mongoose.disconnect();
        process.exit(0);
    }
    for (const p of active) line(`      • ${p.subdomain.padEnd(18)} ${p.display_name}`);

    const userIds = active.map((p) => p.user_id);

    // ── 3. Starea de risc ───────────────────────────────────────────────────
    line();
    line('3. Anunțuri în pericol');

    const [expira7, expira30, inGrace, totalActive] = await Promise.all([
        sales.countDocuments({ user_id: { $in: userIds }, is_active: true, paid_until: { $lte: days(7) } }),
        sales.countDocuments({ user_id: { $in: userIds }, is_active: true, paid_until: { $lte: days(30) } }),
        sales.countDocuments({ user_id: { $in: userIds }, status: 'grace_period' }),
        sales.countDocuments({ user_id: { $in: userIds }, is_active: true }),
    ]);

    line(`   Anunțuri active la parcuri:        ${totalActive}`);
    line(`   Expiră în 7 zile:                  ${expira7}   ${expira7 > 0 ? '⚠️' : '✅'}`);
    line(`   Expiră în 30 de zile:              ${expira30}`);
    line(`   Deja în grace period (invizibile): ${inGrace}   ${inGrace > 0 ? '❌' : '✅'}`);

    if (inGrace > 0) {
        line();
        line('   ❌ Anunțurile din grace period NU apar pe site-ul dealerului.');
        line('      Rulează cu --run ca să le readuci acum.');
    }

    // Cel mai apropiat termen de expirare — indicatorul cel mai util.
    const next = await sales.findOne({ user_id: { $in: userIds }, is_active: true })
        .sort({ paid_until: 1 }).select('paid_until title').lean();
    if (next) {
        const d = Math.round((new Date(next.paid_until) - Date.now()) / 86400000);
        line();
        line(`   Cel mai apropiat termen: peste ${d} zile ("${next.title}")`);
        if (d > 150) {
            line('   ✅ Peste 150 de zile → protecția a rulat recent.');
        } else if (d < 10) {
            line('   ⚠️  Sub 10 zile → cronul nu a rulat sau nu e integrat corect.');
        } else {
            line('   ℹ️  Normal dacă anunțurile sunt recente. Verifică din nou mâine dimineață.');
        }
    }

    // ── 4. Rulare efectivă ──────────────────────────────────────────────────
    if (RUN) {
        line();
        line('4. Rulez protecția acum');
        const p = await mod.protectDealerSales();
        const r = await mod.reviveDealerSales();
        line(`   Prelungite: ${p.protected}${p.skipped ? ' (sărit — eroare la citirea parcurilor)' : ''}`);
        line(`   Readuse din grace period: ${r.revived}`);

        const dupa = await sales.countDocuments({
            user_id: { $in: userIds }, is_active: true, paid_until: { $lte: days(30) },
        });
        line(`   Mai expiră în 30 de zile: ${dupa}   ${dupa === 0 ? '✅' : '⚠️'}`);
    } else {
        line();
        line('4. Rulare');
        line('   (doar raport — adaugă --run ca să rulezi efectiv protecția)');
    }

    // ── 5. Ce să urmărești ──────────────────────────────────────────────────
    line();
    line('══════════════════════════════════════════════════');
    line('  CUM CONFIRMI CĂ CRONUL E INTEGRAT');
    line('══════════════════════════════════════════════════');
    line('  Mâine dimineață, după ora 3:');
    line();
    line('    pm2 logs backend --lines 300 --nostream | grep -i parcMaintenance');
    line();
    line('  Trebuie să vezi cel puțin linia cu 🏢 Parcuri: ... ');
    line('  Dacă nu apare nimic, cronul nu e montat sau e în afara gardului');
    line('  NODE_APP_INSTANCE === \'0\'.');
    line();
    line('  Test rapid, fără să aștepți până mâine:');
    line('    node scripts/verifyParcMaintenance.js --run');
    line();

    await mongoose.disconnect();
    process.exit(0);
};

run().catch((err) => {
    console.error('❌ Eroare:', err.message);
    process.exit(1);
});
