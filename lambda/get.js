const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const bucket = process.env.BUCKET_NAME;
const s3 = new S3Client({});

exports.handler = async (event) => {
  const key = event.pathParameters.key;

  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    const text = await result.Body.transformToString();

    return {
      statusCode: 200,
      body: text,
      headers: { "Content-Type": "application/json" },
    };
  } catch (err) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "File not found", key }),
    };
  }
};
