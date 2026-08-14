import sharp from 'sharp';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();

// ============================================================================
//  src/utils/parcUpload.js
// ----------------------------------------------------------------------------
//  Procesarea și urcarea în R2 a celor două imagini de branding ale unui parc.
//
//  ── DE CE CHEI PLATE, OBLIGATORIU ─────────────────────────────────────────
//  Funcțiile `deleteFromR2()` existente din userProfiles.js și usersRoute.js
//  extrag cheia cu `publicUrl.split('/').pop()`. Dacă am pune fișierele într-un
//  subfolder (`parcuri/logo_x.jpg`), acele funcții ar încerca să șteargă cheia
//  `logo_x.jpg` — care nu există — și fișierul real ar rămâne pe R2 pe veci.
//  Deci: `parc_logo_<parcId>_<ts>.jpg`, fără slash. Fără excepții.
//
//  ── DE CE LOGO-UL SE APLATIZEAZĂ PE ALB ───────────────────────────────────
//  Pare o pierdere (se distruge transparența), dar e exact decizia de design:
//  logo-ul se afișează într-un container rotunjit cu fundal alb, tocmai ca să
//  meargă cu orice fișier trimite dealerul — inclusiv PNG-uri cu fundal alb
//  care pe un header colorat ar arăta ca un dreptunghi urât. Aplatizarea pe
//  alb la procesare face ca rezultatul din R2 să fie identic cu ce se vede pe
//  site, deci nu există surprize între preview și producție.
//
//  ── PARAMETRII DE COMPRESIE ───────────────────────────────────────────────
//  Bannerul folosește EXACT setările din mediaWorker.js (JPEG 76-78,
//  progressive, mozjpeg). Consistență deliberată: dacă vreodată ajustezi
//  calitatea imaginilor, o faci într-un singur loc mental, nu în două.
// ============================================================================

const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const PROFILES = {
    logo: {
        width: 512,
        height: 512,
        fit: 'contain',                       // NU 'cover' — ar tăia logo-urile late
        background: { r: 255, g: 255, b: 255, alpha: 1 },
        quality: 88,
        maxInputBytes: 8 * 1024 * 1024,
    },
    banner: {
        width: 1920,
        height: 640,                          // raport 3:1, ca în cropper
        fit: 'cover',
        position: 'center',
        quality: 78,
        maxInputBytes: 15 * 1024 * 1024,
    },
};

/**
 * Procesează un buffer de imagine și îl urcă în R2.
 *
 * @param {object}  opts
 * @param {Buffer}  opts.buffer   conținutul fișierului (multer memoryStorage)
 * @param {'logo'|'banner'} opts.kind
 * @param {string}  opts.parcId   ObjectId ca string (pre-generat înainte de create)
 * @returns {Promise<{ url: string, public_id: string, width: number, height: number }>}
 * @throws  Error cu mesaj în română, gata de trimis către interfață
 */
export const uploadParcImage = async ({ buffer, kind, parcId }) => {
    const profile = PROFILES[kind];
    if (!profile) throw new Error(`Tip de imagine necunoscut: ${kind}`);
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('Fișier gol sau invalid.');
    }
    if (buffer.length > profile.maxInputBytes) {
        throw new Error(`Fișierul depășește ${Math.round(profile.maxInputBytes / 1024 / 1024)}MB.`);
    }

    // sharp aruncă pe orice nu e imagine reală — e cel mai bun guard de conținut,
    // mai sigur decât mimetype-ul, care vine de la client și poate fi falsificat.
    let meta;
    try {
        meta = await sharp(buffer).metadata();
    } catch {
        throw new Error('Fișierul nu este o imagine validă.');
    }
    if (!meta.width || !meta.height) {
        throw new Error('Nu am putut citi dimensiunile imaginii.');
    }

    const pipeline = sharp(buffer)
        .rotate()                              // aplică orientarea EXIF fizic
        .resize({
            width: profile.width,
            height: profile.height,
            fit: profile.fit,
            position: profile.position,
            background: profile.background,
            withoutEnlargement: false,         // bannerele mici SE măresc, altfel arată prost
        })
        .flatten({ background: { r: 255, g: 255, b: 255 } })  // transparență → alb
        .jpeg({
            quality: profile.quality,
            progressive: true,
            mozjpeg: true,
            chromaSubsampling: '4:2:0',
        });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    // Cheie PLATĂ. Vezi comentariul din capul fișierului.
    const publicId = `parc_${kind}_${parcId}_${Date.now()}.jpg`;

    await r2.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: publicId,
        Body: data,
        ContentLength: data.length,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable', // numele conține timestamp → imuabil
    }));

    return {
        url: `${process.env.R2_PUBLIC_DOMAIN}/${publicId}`,
        public_id: publicId,
        width: info.width,
        height: info.height,
    };
};

/**
 * Șterge o imagine de branding din R2.
 * BEST-EFFORT: nu aruncă niciodată. O imagine orfană costă câțiva kilobytes;
 * o excepție aruncată în mijlocul unei ștergeri de parc ar lăsa baza de date
 * într-o stare inconsistentă.
 */
export const deleteParcImage = async (publicId) => {
    if (!publicId || typeof publicId !== 'string') return;
    // Plasă de siguranță: nu atingem niciodată imaginile partajate.
    if (publicId.includes('splash_logo') || publicId.includes('/')) return;
    if (publicId.startsWith('placeholder_')) return; // create de createTestParc.js

    try {
        await r2.send(new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: publicId,
        }));
    } catch (err) {
        console.warn(`⚠️ [parcUpload] Nu am putut șterge ${publicId} din R2:`, err.message);
    }
};

export default { uploadParcImage, deleteParcImage };
