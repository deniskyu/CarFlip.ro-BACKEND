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


import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();
const httpServer = createServer(app)

app.use(helmet());
app.set('trust proxy', 2);


//app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookRoute);

app.use('/.well-known', express.static(path.join(process.cwd(), 'public/.well-known')));

app.use(express.json());

const version = 1;

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
app.use(adminRoute);

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