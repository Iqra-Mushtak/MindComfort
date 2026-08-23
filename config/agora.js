const getAgoraRestHeaders = () => {
    const customerKey = process.env.AGORA_REST_API_KEY;
    const customerSecret = process.env.AGORA_REST_API_SECRET;

    if (!customerKey || !customerSecret) {
        throw new Error("Missing Agora REST API credentials in .env file");
    }

    const credentials = Buffer.from(`${customerKey}:${customerSecret}`).toString('base64');

    return {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
    };
};

const getAgoraRecordingConfig = () => {
    const s3AccessKey = process.env.BACKBLAZE_APPLICATION_KEY_ID;
    const s3SecretKey = process.env.BACKBLAZE_APPLICATION_KEY;
    const s3Endpoint = process.env.BACKBLAZE_ENDPOINT;
    const s3Bucket = process.env.BACKBLAZE_BUCKET_NAME;
    const s3Region = process.env.BACKBLAZE_REGION || 'us-east-005';

    if (!s3AccessKey || !s3SecretKey || !s3Bucket) {
        throw new Error("Missing S3/B2 credentials for recording storage in .env");
    }

    return {
        recordingConfig: {
            maxIdleTime: 300,
            streamTypes: 0, 
            channelType: 0   
        },
        storageConfig: {
            vendor: 1,  
            region: 0,
            bucket: s3Bucket,
            accessKey: s3AccessKey,
            secretKey: s3SecretKey,
            endpoint: s3Endpoint
        }
    };
};

module.exports = { getAgoraRestHeaders, getAgoraRecordingConfig };