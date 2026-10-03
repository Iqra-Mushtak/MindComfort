const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads', 'receipts');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        const safeName = file.fieldname.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${timestamp}-${safeName}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, filename);
    },
});

const allowedTypes = /\.(pdf|doc|docx|jpg|jpeg|png)$/i;
const fileFilter = (req, file, cb) => {
    if (allowedTypes.test(file.originalname)) {
        cb(null, true);
    } else {
        cb(new Error('Allowed formats: PDF, DOC, DOCX, JPG, JPEG, PNG'));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, 
});

module.exports = upload;

module.exports.mentorDocumentUpload = upload.single('mentorDocument');