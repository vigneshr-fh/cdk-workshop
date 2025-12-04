import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib/core";
import { Function, Code, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import {
  LambdaIntegration,
  LambdaRestApi,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import { HitCounter } from "./hitcounter";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

export class CdkWorkshopStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucket = new Bucket(this, "CdkJsonBucket", {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const queue = new Queue(this, "CdkQueue", {
      visibilityTimeout: Duration.seconds(30),
      retentionPeriod: Duration.days(1),
    });

    const producer = new Function(this, "CdkSqsProducer", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("lambda"),
      handler: "producer.handler",
      environment: {
        QUEUE_URL: queue.queueUrl,
      },
    });

    queue.grantSendMessages(producer);

    const consumer = new Function(this, "CdkSqsConsumer", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("lambda"),
      handler: "consumer.handler",
      environment: {
        BUCKET_NAME: bucket.bucketName,
      },
    });

    const getter = new Function(this, "CdkS3Getter", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset("lambda"),
      handler: "get.handler",
      environment: {
        BUCKET_NAME: bucket.bucketName,
      },
    });

    consumer.addEventSource(new SqsEventSource(queue));

    bucket.grantReadWrite(consumer);
    bucket.grantRead(getter);

    const api = new RestApi(this, "CdkRestApi");

    const item = api.root.addResource("object").addResource("{key}");

    item.addMethod("POST", new LambdaIntegration(producer));
    item.addMethod("GET", new LambdaIntegration(getter));
    item.addMethod("DELETE", new LambdaIntegration(producer));
  }
}
