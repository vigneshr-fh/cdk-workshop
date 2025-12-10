// lambda/opensearch.js
const { defaultProvider } = require("@aws-sdk/credential-provider-node");
const { Client } = require("@opensearch-project/opensearch");
const { AwsSigv4Signer } = require("@opensearch-project/opensearch/aws");

const endpoint = process.env.OPENSEARCH_ENDPOINT;
const region = process.env.AWS_CDK_REGION || "us-east-1";

console.log("OPENSEARCH_ENDPOINT =", endpoint);
console.log("AWS_CDK_REGION =", region);

// construct client with SigV4 signer for AOSS
const client = new Client({
  ...AwsSigv4Signer({
    region,
    service: "aoss",
    // getCredentials returns a promise that resolves to credentials
    getCredentials: () => defaultProvider()(),
  }),
  node: endpoint,
});

// Default index
const INDEX = "users";

exports.main = async (event) => {
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};
  console.log("method:", method, "body:", body);

  try {
    switch (method) {
      case "POST":
        return await createDoc(body);
      case "GET":
        return await getDoc(event.queryStringParameters?.id);
      case "PUT":
        return await updateDoc(body);
      case "DELETE":
        return await deleteDoc(event.queryStringParameters?.id);
      default:
        return resp(400, { error: "Unsupported method" });
    }
  } catch (err) {
    console.error(err);
    return resp(500, { error: err.message, stack: err.stack });
  }
};

// 1) Create Document
async function createDoc(doc) {
  // ensure index exists (idempotent: if exists, returns 400, we ignore)
  try {
    await client.indices.create({ index: INDEX });
  } catch (e) {
    // ignore if already exists
  }

  const res = await client.index({
    index: INDEX,
    body: doc,
  });
  return resp(200, res.body || res);
}

// 2) Read Document
async function getDoc(id) {
  if (!id) return resp(400, { error: "id is required" });
  const res = await client.get({ index: INDEX, id });
  return resp(200, res.body || res);
}

// 3) Update Document
async function updateDoc(doc) {
  if (!doc || !doc.id) return resp(400, { error: "id is required in body" });
  const res = await client.update({
    index: INDEX,
    id: doc.id,
    body: { doc },
  });
  return resp(200, res.body || res);
}

// 4) Delete Document
async function deleteDoc(id) {
  if (!id) return resp(400, { error: "id is required" });
  const res = await client.delete({ index: INDEX, id });
  return resp(200, res.body || res);
}

// helper
function resp(status, body) {
  return {
    statusCode: status,
    body: JSON.stringify(body),
  };
}
