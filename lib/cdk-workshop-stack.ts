import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";

// AppSync Imports
import {
  CfnGraphQLApi,
  CfnDataSource,
  CfnGraphQLSchema,
  CfnResolver,
  AuthorizationType,
  CfnApiKey,
  CfnResolverProps,
} from "aws-cdk-lib/aws-appsync";

// DynamoDB Imports
import { Table, AttributeType, BillingMode } from "aws-cdk-lib/aws-dynamodb";

// IAM Imports
import {
  Role,
  ServicePrincipal,
  PolicyStatement,
  Effect,
} from "aws-cdk-lib/aws-iam";

export class CdkWorkshopStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const NOTES_TABLE_NAME = "AppSyncNotesTable";
    const API_NAME = "NotesAppApi";

    // -------------------------
    // 1. DynamoDB Table (Data Source)
    // -------------------------
    const notesTable = new Table(this, "NotesTable", {
      tableName: NOTES_TABLE_NAME,
      partitionKey: {
        name: "id",
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });
    //

    // -------------------------
    // 2. GraphQL API Definition
    // -------------------------
    const api = new CfnGraphQLApi(this, "GraphQLApi", {
      name: API_NAME,
      authenticationType: AuthorizationType.API_KEY, // Simple API Key for testing
      // If using US-EAST-1, the default is fine. Specify region if needed.
      // xRayEnabled: true,
    });

    // 3. IAM Role for AppSync to Access DynamoDB
    // AppSync needs permissions to read/write to the DynamoDB table.
    const serviceRole = new Role(this, "AppSyncDynamoDBRole", {
      assumedBy: new ServicePrincipal("appsync.amazonaws.com"),
    });

    serviceRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:UpdateItem",
        ],
        resources: [notesTable.tableArn],
      })
    );

    // 4. Data Source Link
    const dataSource = new CfnDataSource(this, "DynamoDataSource", {
      apiId: api.attrApiId,
      name: "NotesDataSource",
      type: "AMAZON_DYNAMODB",
      dynamoDbConfig: {
        tableName: notesTable.tableName,
        awsRegion: this.region,
      },
      serviceRoleArn: serviceRole.roleArn,
    });

    // -------------------------
    // 5. GraphQL Schema Definition
    // -------------------------
    const schema = new CfnGraphQLSchema(this, "NotesSchema", {
      apiId: api.attrApiId,
      definition: `
        type Note {
          id: ID!
          title: String!
          content: String
        }

        input CreateNoteInput {
          title: String!
          content: String
        }

        input UpdateNoteInput {
          id: ID!
          title: String
          content: String
        }
        
        type Query {
          getNote(id: ID!): Note
          listNotes: [Note]
        }

        type Mutation {
          createNote(input: CreateNoteInput!): Note!
          updateNote(input: UpdateNoteInput!): Note!
          deleteNote(id: ID!): Note
        }

        schema {
          query: Query
          mutation: Mutation
        }
      `,
    });
    // Ensure resolvers depend on the schema being created first
    schema.addDependency(dataSource);

    // -------------------------
    // 6. Resolvers (Mapping Requests to Data Source)
    // -------------------------

    // Helper function to create standard CRUD resolvers (Separated for clarity)
    const createResolver = (
      fieldName: string,
      typeName: string,
      dynamodbOperation: string
    ) => {
      let requestTemplate: string;
      let responseTemplate: string;

      switch (dynamodbOperation) {
        case "PutItem": // For createNote
          requestTemplate = `#set($key = $util.dynamodb.toMapValues({ "id": $util.autoId() }))
              $util.toJson({
                "version": "2018-05-29",
                "operation": "PutItem",
                "key": $key,
                "attributeValues": $util.dynamodb.toMapValues($ctx.args.input)
              })`;
          responseTemplate = `$util.toJson($ctx.result)`;
          break;
        case "GetItem": // For getNote
          requestTemplate = `$util.toJson({
                "version": "2018-05-29",
                "operation": "GetItem",
                "key": $util.dynamodb.toMapValues({ "id": $ctx.args.id })
              })`;
          responseTemplate = `$util.toJson($ctx.result)`;
          break;
        case "UpdateItem":
          requestTemplate = `#set($input = $ctx.args.input)
              ## Validate input
              #if($util.isNull($input))
                $util.error("Input cannot be null", "ValidationError")
              #end

              #set($id = $input.id)
              #if($util.isNull($id) || $id == "")
                $util.error("ID is required", "ValidationError")
              #end

              ## Build updateAttributes (exclude id + remove null/empty)
              #set($updateAttributes = {})
              #foreach($entry in $input.entrySet())
                #if($entry.key != "id" && !$util.isNull($entry.value) && $entry.value != "")
                  $util.qr($updateAttributes.put($entry.key, $entry.value))
                #end
              #end

              ## Ensure something is actually being updated
              #if($updateAttributes.isEmpty())
                $util.error("Must provide at least one updatable field.", "ValidationError")
              #end

              ## Try using the built-in expression builder
              #set($expression = $util.dynamodb.updateItem.buildUpdateExpressions($updateAttributes))

              ## If expression builder fails, do manual fallback
              #if($util.isNull($expression))
                #set($updateExpression = "SET")
                #set($first = true)
                #set($names = {})
                #set($values = {})

                #foreach($entry in $updateAttributes.entrySet())
                  #set($key = $entry.key)
                  #if($first)
                    #set($updateExpression = "$updateExpression #$key = :$key")
                    #set($first = false)
                  #else
                    #set($updateExpression = "$updateExpression, #$key = :$key")
                  #end

                  $util.qr($names.put("#$key", $key))
                  $util.qr($values.put(":$key", $util.dynamodb.toDynamoDB($entry.value)))
                #end

                #set($expression = {
                  "expression": $updateExpression,
                  "expressionNames": $names,
                  "expressionValues": $values
                })
              #end

              ## Validate expression output
              #if($util.isNull($expression) || $expression.expression == "")
                $util.error("Failed to generate update expression.", "ValidationError")
              #end

              ## Final DynamoDB request
              $util.toJson({
                "version": "2018-05-29",
                "operation": "UpdateItem",
                "key": {
                  "id": $util.dynamodb.toDynamoDB($id)
                },
                "update": $expression
              })`;

          responseTemplate = `$util.toJson($ctx.result)`;
          break;
        case "DeleteItem": // For deleteNote
          requestTemplate = `$util.toJson({
                "version": "2018-05-29",
                "operation": "DeleteItem",
                "key": $util.dynamodb.toMapValues({ "id": $ctx.args.id })
              })`;
          responseTemplate = `$util.toJson($ctx.result)`;
          break;
        case "Scan": // For listNotes
          requestTemplate = `$util.toJson({
                "version": "2018-05-29",
                "operation": "Scan",
                "limit": $util.defaultIfNonNull($ctx.args.limit, 20)
              })`;
          responseTemplate = `$util.toJson($ctx.result.items)`;
          break;
        default:
          throw new Error(`Unknown DynamoDB operation: ${dynamodbOperation}`);
      }

      return new CfnResolver(this, `${fieldName}Resolver`, {
        apiId: api.attrApiId,
        typeName: typeName,
        fieldName: fieldName,
        dataSourceName: dataSource.name,
        requestMappingTemplate: requestTemplate,
        responseMappingTemplate: responseTemplate,
      }).addDependency(schema);
    };

    // Create Resolvers for CRUD Operations
    createResolver("createNote", "Mutation", "PutItem");
    createResolver("updateNote", "Mutation", "UpdateItem");
    createResolver("deleteNote", "Mutation", "DeleteItem");
    createResolver("getNote", "Query", "GetItem");
    createResolver("listNotes", "Query", "Scan"); // Scan is used for simple list queries

    // -------------------------
    // 7. Output API Endpoint and Key
    // -------------------------

    const apiKey = new CfnApiKey(this, "ApiKey", {
      apiId: api.attrApiId,
    });

    new CfnOutput(this, "GraphQLEndpoint", {
      value: api.attrGraphQlUrl,
    });

    new CfnOutput(this, "GraphQLApiKey", {
      value: apiKey.attrApiKey,
    });
  }
}
