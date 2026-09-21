const Redis = require('ioredis');
require('dotenv').config();

const redisUrl = process.env.REDIS_URL;
let redisClient;

if (redisUrl) {
    redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        tls: { rejectUnauthorized: false }
    });
} else {
    redisClient = new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
        tls: { rejectUnauthorized: false }
    });
}

redisClient.on('connect', () => console.log('Successfully connected to Redis'));
redisClient.on('error', (err) => console.error('Redis Client Error:', err));

module.exports = redisClient;