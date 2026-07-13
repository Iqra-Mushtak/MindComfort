const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const createUserRateLimiter = ({ windowMs, max, message, skip }) => rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req),
    skip,
    handler: (req, res) => {
        res.status(429).json({ message: message || 'Too many requests. Please try again later.' });
    },
});

const generalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, 
    message: { message: "Too many attempts, please try again after 15 minutes." },
    standardHeaders: true, 
    legacyHeaders: false,
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: 'Too many login attempts. Try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false, 
});

const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 3,
    message: { message: 'Too many OTP attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: { message: 'Too many accounts created. Try again in 1 hour.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const podcastCommentLimiter = createUserRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: 'You can only post 5 comments in the podcast session.',
    skip: (req) => !req.user || !['client'].includes(req.user.role),
});

module.exports = { generalRateLimiter, loginLimiter, otpLimiter, registerLimiter, podcastCommentLimiter, createUserRateLimiter };