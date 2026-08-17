import mongoose from 'mongoose';

// ============================================================================
//  src/utils/oid.js
// ----------------------------------------------------------------------------
//  Conversie sigură la ObjectId, pentru orice pipeline de agregare.
//
//  ── PROBLEMA PE CARE O REZOLVĂ ────────────────────────────────────────────
//  Mongoose castează automat filtrele din `find`, `findOne`, `countDocuments`
//  și `updateMany` — un șir de 24 de caractere hexazecimale devine ObjectId,
//  pentru că schema spune ce tip are câmpul.
//
//  `aggregate()` NU face asta. Pipeline-ul pleacă exact cum l-ai scris, iar
//  MongoDB compară pe tip BSON: un șir nu e niciodată egal cu un ObjectId.
//
//  Efectul e insidios, pentru că nu produce nicio eroare. Aceleași date, două
//  răspunsuri: `find` întoarce mașinile, `aggregate` întoarce zero. Un site
//  care afișa corect anunțurile scria „0 mașini disponibile" în titlu.
//
//  ── REGULA ────────────────────────────────────────────────────────────────
//  Orice `$match` pe un câmp de tip ObjectId trece prin `toOid()`.
//  E idempotent: un ObjectId primit ca ObjectId iese neschimbat.
// ============================================================================

/**
 * @param {*} v  ObjectId, șir hexazecimal de 24, sau orice altceva
 * @returns {mongoose.Types.ObjectId|null} null dacă nu se poate converti
 */
export const toOid = (v) => {
    if (!v) return null;
    if (v instanceof mongoose.Types.ObjectId) return v;
    const s = String(v);
    return mongoose.Types.ObjectId.isValid(s) ? new mongoose.Types.ObjectId(s) : null;
};

/** Varianta pentru liste, folosită în `$in`. Elimină valorile invalide. */
export const toOidList = (arr) =>
    (Array.isArray(arr) ? arr : []).map(toOid).filter(Boolean);

export default { toOid, toOidList };
