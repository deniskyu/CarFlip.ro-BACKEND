import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import indexRoute from './src/routes/indexRoute.js';
import cors from 'cors';
import stripeWebhookRoute from './src/routes/stripeWebhookRoute.js';
import startCronJobs from './src/cronJobs/cronJobs.js';
import { createServer } from 'http';
import { initSocket } from './src/socket/socketManager.js';

dotenv.config();

const app = express();
const httpServer = createServer(app)

app.set('trust proxy', 1);

app.use(cors());

app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookRoute);

app.use(express.json());

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