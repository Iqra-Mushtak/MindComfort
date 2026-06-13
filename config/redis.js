const Redis = require('ioredis');
require('dotenv').config();

// const redisClient = redis.createClient({
//     url: 'redis://localhost:6379'

const redisClient = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null
});

redisClient.on('connect', () => console.log('Successfully connected to Redis'));
redisClient.on('error', (err) => console.log('Redis Client Error', err));
// console.log("Checking password from env:", process.env.REDIS_PASSWORD);

module.exports = redisClient;