const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const { encode } = require('html-entities');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const sanitizeObject = (obj) => {
    for (let key in obj) {
        if (typeof obj[key] === 'string') {
            let clean = DOMPurify.sanitize(obj[key]);
            obj[key] = encode(clean);
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            sanitizeObject(obj[key]);
        }
    }
    return obj;
};

const sanitize = (req, res, next) => {
    if (req.body) {
        req.body = sanitizeObject(req.body);
    }
    next();
};

module.exports = sanitize;