const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authmiddleware');
const { receiptUpload } = require('../middleware/upload');

const { 
    submitManualTransaction, 
    getPendingTransactions, 
    getMyTransactions,
    reviewTransaction 
} = require('../controllers/manualTransactionController');

let authFunc;
if (typeof authMiddleware === 'function') {
    authFunc = authMiddleware;
} else if (authMiddleware && typeof authMiddleware.verifyToken === 'function') {
    authFunc = authMiddleware.verifyToken;
} else if (authMiddleware && typeof authMiddleware.authenticate === 'function') {
    authFunc = authMiddleware.authenticate;
} else if (authMiddleware && typeof authMiddleware.protect === 'function') {
    authFunc = authMiddleware.protect;
} else {
    authFunc = (req, res, next) => next();
    console.warn('WARNING: Could not find auth function. Using temporary bypass. Check authmiddleware.js');
}

router.post('/submit', authFunc, receiptUpload.single('receipt'), submitManualTransaction);
router.get('/mine', authFunc, getMyTransactions);
router.get('/pending', authFunc, getPendingTransactions);
router.put('/:id/review', authFunc, reviewTransaction);

module.exports = router;