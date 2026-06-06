const validateEnv = () => {
    const requiredEnv = [
        'JWT_SECRET', 
        'MONGO_URI', 
        'AGORA_APP_ID', 
        'AGORA_APP_CERTIFICATE',
        'CLIENT_URL'
    ];
    
    const missing = requiredEnv.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.error(`FATAL: Missing environment variables: ${missing.join(', ')}`);
        process.exit(1); 
    }
    console.log('Environment configuration validated.');
};

module.exports = validateEnv;