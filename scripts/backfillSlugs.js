// ============================================================================
//  scripts/backfillSlugs.js
// ----------------------------------------------------------------------------
//  Generează `slug` pentru toate anunțurile existente care nu au deja unul.
//
//  RULARE:   node scripts/backfillSlugs.js
//  DRY-RUN:  node scripts/backfillSlugs.js --dry
//
//  Proprietăți importante:
//   • IDEMPOTENT — poate fi rulat de câte ori vrei; atinge doar documentele
//     fără slug. Dacă se oprește la jumătate, îl reiei fără efecte secundare.
//   • Paginare pe _id crescător, nu skip/limit — nu ratează și nu repetă
//     documente chiar dacă se scriu anunțuri noi în timpul rulării.
//   • Tratează coliziunile: la duplicate key (cod 11000) reîncearcă documentul
//     cu un sufix mai lung din _id (6 → 10 → 16 → 24 caractere). Practic nu se
//     va întâmpla niciodată, dar dacă se întâmplă nu vrei să afli din 500-uri
//     în producție peste trei săptămâni.
//   • Nu atinge `updatedAt` (timestamps: false) — altfel ai fi resetat
//     ordinea „ultimele modificate" pentru toată baza dintr-o singură rulare.
//
//  ⚠️ ÎNAINTE DE RULARE: câmpul `slug` și indexul unic sparse trebuie să existe
//     deja în salesModel.js. Vezi instrucțiunile de modificare manuală.
// ============================================================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import sales from '../src/models/salesModel.js';
import { generateSaleSlug } from '../src/utils/slug.js';

const BATCH_SIZE = 500;
const RETRY_SUFFIX_LENGTHS = [10, 16, 24];
const DRY_RUN = process.argv.includes('--dry');

const line = (s = '') => console.log(s);

const run = async () => {
    line('══════════════════════════════════════════════════');
    line('  BACKFILL SLUG-URI PENTRU ANUNȚURI');
    if (DRY_RUN) line('  MOD: DRY-RUN (nu se scrie nimic în baza de date)');
    line('══════════════════════════════════════════════════');
    line();

    await mongoose.connect(process.env.DB_URL);
    line('✅ Conectat la MongoDB');

    // Prinde toate cele trei forme de „lipsă": absent, null, string gol.
    const missingFilter = {
        $or: [
            { slug: { $exists: false } },
            { slug: null },
            { slug: '' },
        ],
    };

    const total = await sales.countDocuments(missingFilter);
    line(`📊 Anunțuri fără slug: ${total}`);

    if (total === 0) {
        line('✅ Nimic de făcut. Toate anunțurile au deja slug.');
        await mongoose.disconnect();
        process.exit(0);
    }

    let lastId = null;
    let processed = 0;
    let written = 0;
    let retried = 0;
    let failed = 0;
    const samples = [];

    while (true) {
        const query = { ...missingFilter };
        if (lastId) query._id = { $gt: lastId };

        const batch = await sales
            .find(query)
            .select('_id brand model production_year')
            .sort({ _id: 1 })
            .limit(BATCH_SIZE)
            .lean();

        if (batch.length === 0) break;

        lastId = batch[batch.length - 1]._id;
        processed += batch.length;

        const ops = batch.map((doc) => ({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { slug: generateSaleSlug(doc) } },
                timestamps: false, // nu atingem updatedAt
            },
        }));

        if (samples.length < 5) {
            for (const doc of batch.slice(0, 5 - samples.length)) {
                samples.push(generateSaleSlug(doc));
            }
        }

        if (DRY_RUN) {
            written += ops.length;
        } else {
            try {
                const res = await sales.bulkWrite(ops, { ordered: false });
                written += res.modifiedCount || 0;
            } catch (err) {
                // ordered:false → restul operațiilor au trecut, doar cele din
                // writeErrors au eșuat. Le reluăm individual, cu sufix mai lung.
                written += err?.result?.nModified || err?.result?.result?.nModified || 0;
                const writeErrors = err?.writeErrors || [];

                for (const we of writeErrors) {
                    const idx = typeof we.index === 'number' ? we.index : we?.err?.index;
                    const doc = batch[idx];
                    if (!doc) { failed++; continue; }

                    const isDuplicate = (we.code || we?.err?.code) === 11000;
                    if (!isDuplicate) {
                        failed++;
                        console.warn(`   ⚠️  Eroare non-duplicat la ${doc._id}: ${we.errmsg || we.message}`);
                        continue;
                    }

                    let ok = false;
                    for (const len of RETRY_SUFFIX_LENGTHS) {
                        try {
                            await sales.updateOne(
                                { _id: doc._id },
                                { $set: { slug: generateSaleSlug(doc, len) } },
                                { timestamps: false }
                            );
                            ok = true;
                            retried++;
                            written++;
                            console.log(`   ♻️  Coliziune rezolvată pentru ${doc._id} (sufix ${len})`);
                            break;
                        } catch (e) {
                            if (e.code !== 11000) {
                                console.warn(`   ⚠️  ${doc._id}: ${e.message}`);
                                break;
                            }
                        }
                    }
                    if (!ok) {
                        failed++;
                        console.error(`   ❌ Nu am putut genera slug unic pentru ${doc._id}`);
                    }
                }
            }
        }

        const pct = Math.min(100, Math.round((processed / total) * 100));
        line(`   ... ${processed}/${total} (${pct}%)`);
    }

    line();
    line('── Exemple de slug-uri generate ──');
    for (const s of samples) line(`   ${s}`);

    line();
    line('══════════════════════════════════════════════════');
    line(`  Procesate:            ${processed}`);
    line(`  Scrise:               ${written}`);
    line(`  Coliziuni rezolvate:  ${retried}`);
    line(`  Eșecuri:              ${failed}`);
    if (DRY_RUN) line('  (DRY-RUN — nimic nu a fost scris efectiv)');
    line('══════════════════════════════════════════════════');

    if (!DRY_RUN) {
        const remaining = await sales.countDocuments(missingFilter);
        line(remaining === 0
            ? '✅ Verificare finală: toate anunțurile au slug.'
            : `⚠️  Verificare finală: au rămas ${remaining} anunțuri fără slug. Rulează din nou.`);
    }

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
};

run().catch((err) => {
    console.error('❌ Backfill eșuat:', err);
    process.exit(1);
});
