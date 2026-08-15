import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import indexRoute from './src/routes/indexRoute.js';
import cors from 'cors';
//import stripeWebhookRoute from './src/routes/stripeWebhookRoute.js';
import startCronJobs from './src/cronJobs/cronJobs.js';
import { createServer } from 'http';
import { initSocket } from './src/socket/socketManager.js';
import helmet from 'helmet';
import adminRoute from './src/routes/adminRoute.js';


import adminParcuriRoute from './src/routes/adminParcuriRoute.js';
import resolveParc from './src/middleware/resolveParc.js';
import siteRoute from './src/routes/siteRoute.js';
import siteApiRoute from './src/routes/siteApiRoute.js';
import siteSeoRoute from './src/routes/siteSeoRoute.js';
import dealerAdminRoute from './src/routes/dealerAdminRoute.js';
import blockSiteLeak from './src/middleware/blockSiteLeak.js';

import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();
const httpServer = createServer(app)

httpServer.keepAliveTimeout = 65000;
httpServer.headersTimeout = 66000;

// Domeniul public R2. Citit din env ca să nu existe două surse de adevăr.
const MEDIA_ORIGIN = process.env.R2_PUBLIC_DOMAIN || 'https://media.car-flip.com';

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],

            // 'unsafe-inline' rămâne: paginile existente (/post/:id, /profile/:id)
            // au script și style inline. Nu se scoate în acest batch.
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],

            // Pozele mașinilor, logo-urile și bannerele vin din R2.
            // data: e necesar pentru placeholderele inline și SVG-urile mici.
            imgSrc: ["'self'", 'data:', 'blob:', MEDIA_ORIGIN],

            // Videoclipurile din anunțuri, tot din R2.
            mediaSrc: ["'self'", MEDIA_ORIGIN],

            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'", MEDIA_ORIGIN],

            // Harta din pagina de contact (Batch 6).
            frameSrc: ["'self'", 'https://www.google.com', 'https://maps.google.com'],

            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],

            // Nimeni nu are voie să pună site-urile într-un iframe:
            // apărare contra clickjacking pe panoul dealerului.
            frameAncestors: ["'self'"],

            upgradeInsecureRequests: [],
        }
    },
    // R2 servește imaginile de pe alt origin. Politica implicită same-origin
    // a lui helmet ar bloca încărcarea lor cross-origin în unele browsere.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));


app.set('trust proxy', 2);


//app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookRoute);

app.use('/.well-known', express.static(path.join(process.cwd(), 'public/.well-known')));

app.use(express.json());

const version = 2;

app.get('/api/app/version', (req, res) => {
    res.status(200).json({
        version, success: true 
    });
});

const adminCors = cors({
    origin: process.env.ADMIN_PANEL_URL,
    credentials: true,
});
app.use('/api/admin', adminCors);  // ← adaugă asta
app.use((req, res, next) => {
    if (req.path.startsWith('/api/admin')) return next();
    cors()(req, res, next);
});

app.use(resolveParc);

// API-ul și SEO-ul site-urilor, ÎNAINTE de ruta de test.
// Ordinea contează: garda anti-scurgere din siteTestRoute oprește orice cale
// nerezolvată, deci rutele reale trebuie să apuce request-ul primele.
app.use(siteApiRoute);
app.use(siteSeoRoute);

app.use(dealerAdminRoute);

app.use(siteRoute);   

app.use(blockSiteLeak); 

app.use(adminRoute);
app.use(adminParcuriRoute);

app.use(indexRoute);

startCronJobs();

mongoose.connect(`${process.env.DB_URL}`)
.then(()=>console.log(`Succesfully connected to database`))
.catch((er)=>console.log(`Could not connect to the database: ${er}`));

initSocket(httpServer)
    .then(() => {
        httpServer.listen(process.env.PORT || 4000, () => {
            console.log(`Server opened on port ${process.env.PORT || 4000}`);
            if (process.send) process.send('ready'); // ← aici
        });
    })
.catch(err => console.error('❌ Socket init failed:', err));