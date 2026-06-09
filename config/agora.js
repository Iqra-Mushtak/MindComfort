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

module.exports = { getAgoraRestHeaders };