import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as opensearch from "aws-cdk-lib/aws-opensearchserverless";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";

export class CdkWorkshopStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const COLLECTION_NAME = "workshop-collection";

    // 1. Encryption Policy (Required for Collection)
    const encryptionPolicy = new opensearch.CfnSecurityPolicy(
      this,
      "EncryptionPolicy",
      {
        name: "workshop-encryption-policy",
        type: "encryption",
        policy: JSON.stringify({
          Rules: [
            {
              ResourceType: "collection",
              Resource: [`collection/${COLLECTION_NAME}`],
            },
          ],
          AWSOwnedKey: true,
        }),
      }
    );

    // 2. Network Policy (Required to allow Public Access)
    // Note: We are allowing public access so Lambda (outside VPC) can reach it.
    const networkPolicy = new opensearch.CfnSecurityPolicy(
      this,
      "NetworkPolicy",
      {
        name: "workshop-network-policy",
        type: "network",
        policy: JSON.stringify([
          {
            Rules: [
              {
                ResourceType: "collection",
                Resource: [`collection/${COLLECTION_NAME}`],
              },
              {
                ResourceType: "dashboard",
                Resource: [`collection/${COLLECTION_NAME}`],
              },
            ],
            AllowFromPublic: true,
          },
        ]),
      }
    );

    // 3. OpenSearch Serverless Collection
    const collection = new opensearch.CfnCollection(this, "Collection", {
      name: COLLECTION_NAME,
      type: "SEARCH", // 'SEARCH' is best for standard CRUD text search
      description: "Collection for CRUD workshop",
    });

    // Ensure policies are created before the collection
    collection.addDependency(encryptionPolicy);
    collection.addDependency(networkPolicy);

    // 4. Lambda Function
    const fn = new lambdaNode.NodejsFunction(this, "OSLambda", {
      entry: path.join(__dirname, "../lambda/opensearch.js"), // Adjust path if needed
      handler: "main",
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(30), // Increased timeout for AOSS connection
      environment: {
        OPENSEARCH_ENDPOINT: collection.attrCollectionEndpoint,
        AWS_CDK_REGION: this.region,
      },
      bundling: {
        // Ensure opensearch client is bundled if not in a layer
        externalModules: ["aws-sdk"],
      },
    });

    // 5. Data Access Policy (Crucial: Grants Lambda permission INSIDE OpenSearch)
    const accessPolicy = new opensearch.CfnAccessPolicy(
      this,
      "DataAccessPolicy",
      {
        name: "workshop-access-policy",
        type: "data",
        policy: JSON.stringify([
          {
            Rules: [
              {
                ResourceType: "collection",
                Resource: [`collection/${COLLECTION_NAME}`],
                Permission: [
                  "aoss:CreateCollectionItems",
                  "aoss:DeleteCollectionItems",
                  "aoss:UpdateCollectionItems",
                  "aoss:DescribeCollectionItems",
                ],
              },
              {
                ResourceType: "index",
                Resource: [`index/${COLLECTION_NAME}/*`],
                Permission: [
                  "aoss:CreateIndex",
                  "aoss:DeleteIndex",
                  "aoss:UpdateIndex",
                  "aoss:DescribeIndex",
                  "aoss:ReadDocument",
                  "aoss:WriteDocument",
                ],
              },
            ],
            Principal: [fn.role!.roleArn],
          },
        ]),
      }
    );

    // 6. IAM Permissions (Grants Lambda permission to talk to the AOSS API service)
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "AllowAOSSAPI",
        effect: iam.Effect.ALLOW,
        actions: ["aoss:APIAccessAll"],
        resources: [collection.attrArn],
      })
    );

    // -------------------------------
    // 7) API Gateway
    // -------------------------------
    const api = new LambdaRestApi(this, "CrudApi", {
      handler: fn,
      proxy: false,
    });

    const item = api.root.addResource("item");
    item.addMethod("POST");
    item.addMethod("GET");
    item.addMethod("PUT");
    item.addMethod("DELETE");
  }
}
