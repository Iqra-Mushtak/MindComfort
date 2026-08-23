const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  accessKeyId: process.env.BACKBLAZE_APPLICATION_KEY_ID,
  secretAccessKey: process.env.BACKBLAZE_APPLICATION_KEY,
  endpoint: process.env.BACKBLAZE_ENDPOINT,
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
  region: process.env.BACKBLAZE_REGION || 'us-east-005',
});

const authorizeB2 = async () => {
  try {
    await s3.listBuckets().promise();
    console.log('B2 S3 connection authorized successfully');
    return s3;
  } catch (error) {
    console.error('B2 S3 authorization failed:', error.message);
    throw error;
  }
};

const uploadToB2 = async (key, fileBuffer, mimeType, targetBucket = process.env.BACKBLAZE_BUCKET_NAME) => {
  const params = {
    Bucket: targetBucket,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
  };
  try {
    const response = await s3.upload(params).promise();
    console.log(`File uploaded to B2 S3: ${key}`);
    return response;
  } catch (error) {
    console.error('B2 S3 upload failed:', error.message);
    throw error;
  }
};

const getB2FileUrl = (filename, bucketName = process.env.BACKBLAZE_BUCKET_NAME) => {
  const downloadHost = process.env.BACKBLAZE_DOWNLOAD_ENDPOINT || 'https://f005.backblazeb2.com';
  return `${downloadHost}/file/${bucketName}/${filename}`;
};

module.exports = {
  s3,
  authorizeB2,
  uploadToB2,
  getB2FileUrl,
};
