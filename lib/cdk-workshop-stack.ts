import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib/core";
import { Function, Code, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import {
  LambdaIntegration,
  LambdaRestApi,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import { Bucket } from "aws-cdk-lib/aws-s3";

export class CdkWorkshopStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const bucket = new Bucket(this, "CdkCrudBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const func = new Function(this, "CdkS3CrudHandler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("lambda"),
      handler: "bucket.handler",
      environment: {
        BUCKET_NAME: bucket.bucketName,
      },
    });

    bucket.grantReadWrite(func);

    const api = new RestApi(this, "CdkS3CrudApi");

    const object = api.root.addResource("object");
    const objectKey = object.addResource("{key}");

    objectKey.addMethod("POST", new LambdaIntegration(func));
    objectKey.addMethod("GET", new LambdaIntegration(func));
    objectKey.addMethod("DELETE", new LambdaIntegration(func));

    new CfnOutput(this, "ApiUrl", {
      value: api.url,
    });

    new CfnOutput(this, "BucketName", {
      value: bucket.bucketName,
    });
  }
}
