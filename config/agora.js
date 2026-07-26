// const getAgoraRestHeaders = () => {
//     const customerKey = process.env.AGORA_REST_API_KEY;
//     const customerSecret = process.env.AGORA_REST_API_SECRET;

//     if (!customerKey || !customerSecret) {
//         throw new Error("Missing Agora REST API credentials in .env file");
//     }

//     const credentials = Buffer.from(`${customerKey}:${customerSecret}`).toString('base64');

//     return {
//         'Authorization': `Basic ${credentials}`,
//         'Content-Type': 'application/json'
//     };
// };

// const getAgoraRecordingConfig = () => {
//     const s3AccessKey = process.env.BACKBLAZE_APPLICATION_KEY_ID;
//     const s3SecretKey = process.env.BACKBLAZE_APPLICATION_KEY;
//     const s3Endpoint = process.env.BACKBLAZE_ENDPOINT;
//     const s3Bucket = process.env.BACKBLAZE_BUCKET_NAME;
//     const s3Region = process.env.BACKBLAZE_REGION;

//     if (!s3AccessKey || !s3SecretKey || !s3Endpoint || !s3Bucket || !s3Region) {
//         throw new Error("Missing S3/B2 credentials for recording storage. Required: BACKBLAZE_APPLICATION_KEY_ID, BACKBLAZE_APPLICATION_KEY, BACKBLAZE_ENDPOINT, BACKBLAZE_BUCKET_NAME, BACKBLAZE_REGION");
//     }

//     return {
//         recordingConfig: {
//             maxIdleTime: 30,
//             streamTypes: 0,  // 0 = audio only
//             channelType: 0   // 0 = RTC channel
//         },
//         storageConfig: {
//             vendor: 1,  // 1 = AWS S3 (compatible with B2)
//             region: s3Region,
//             bucket: s3Bucket,
//             accessKey: s3AccessKey,
//             secretKey: s3SecretKey
//         }
//     };
// };

// module.exports = { getAgoraRestHeaders, getAgoraRecordingConfig };



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
    return {
        recordingConfig: {
            maxIdleTime: 30,
            streamTypes: 0,  
            channelType: 0   
        }
    };
};

module.exports = { getAgoraRestHeaders, getAgoraRecordingConfig };