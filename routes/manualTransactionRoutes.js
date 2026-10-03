const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authmiddleware');
const upload = require('../middleware/upload');

const { 
    submitManualTransaction, 
    getPendingTransactions, 
    reviewTransaction 
} = require('../controllers/manualTransactionController');

router.post('/submit', authMiddleware, upload.single('receipt'), submitManualTransaction);

router.get('/pending', authMiddleware, getPendingTransactions);
router.put('/:id/review', authMiddleware, reviewTransaction);

module.exports = router;