import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisConnection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null, // Obligatoriu pentru BullMQ
});

redisConnection.on('error', (err) => console.error('❌ Redis Connection Error:', err));
redisConnection.on('connect', () => console.log('✅ Connected to Redis'));

export default redisConnection;