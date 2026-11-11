// services/s3.service.js
const AWS = require("aws-sdk");
const fs = require("fs");

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "us-east-1",
});

const uploadToS3 = async (filePath, key, contentType) => {
  try {
    const fileContent = fs.readFileSync(filePath);
    
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: contentType || "application/octet-stream",
      ACL: "public-read",
    };

    const result = await s3.upload(params).promise();
    return result.Location;
  } catch (error) {
    console.error("S3 upload error:", error);
    throw error;
  }
};

const deleteFromS3 = async (key) => {
  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
    };

    await s3.deleteObject(params).promise();
    return true;
  } catch (error) {
    console.error("S3 delete error:", error);
    return false;
  }
};

module.exports = {
  uploadToS3,
  deleteFromS3,
};