const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const bucket = process.env.BUCKET_NAME;
const s3 = new S3Client({});

exports.handler = async (event) => {
  console.log("Messages:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const msg = JSON.parse(record.body);
    const { method, key, body } = msg;

    // CREATE / UPDATE JSON
    if (method === "POST") {
      const json = JSON.parse(body);

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: "application/json",
          Body: JSON.stringify(json, null, 2),
        })
      );

      console.log("Saved:", key);
    }

    // DELETE JSON
    if (method === "DELETE") {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );
      console.log("Deleted:", key);
    }
  }
};
