const rateLimit = require('express-rate-limit');

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

module.exports = { generalRateLimiter, loginLimiter, otpLimiter, registerLimiter };