// lambda/index.js
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const { Readable } = require("stream");
const s3 = new S3Client({});

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const key = event.pathParameters?.key;
  const bucket = process.env.BUCKET_NAME;

  try {
    // CREATE or UPDATE JSON
    if (method === "POST") {
      if (!event.body) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Body required" }),
        };
      }

      // Expect raw JSON body
      let json;
      try {
        json = JSON.parse(event.body);
      } catch (err) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Invalid JSON" }),
        };
      }

      // Store JSON as formatted string
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify(json, null, 2),
          ContentType: "application/json",
        })
      );

      return {
        statusCode: 200,
        body: JSON.stringify({ message: "JSON file saved", key }),
      };
    }

    // READ
    if (method === "GET") {
      const res = await s3.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );

      const txt = await streamToString(res.Body);
      let json;
      try {
        json = JSON.parse(txt);
      } catch {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: "File is not valid JSON" }),
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify(json),
      };
    }

    // DELETE
    if (method === "DELETE") {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );

      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Deleted", key }),
      };
    }

    return { statusCode: 405, body: "Method not allowed" };
  } catch (err) {
    console.error(err);
    const status =
      err.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404
        ? 404
        : 500;

    return {
      statusCode: status,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
