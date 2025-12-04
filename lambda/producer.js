const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

const sqs = new SQSClient({});
const QUEUE_URL = process.env.QUEUE_URL;

exports.handler = async (event) => {
  const method = event.httpMethod;
  const key = event.pathParameters.key;
  const body = event.body;

  const message = {
    method,
    key,
    body: body || null,
  };

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(message),
    })
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Request accepted",
      operation: method,
      key,
    }),
  };
};
