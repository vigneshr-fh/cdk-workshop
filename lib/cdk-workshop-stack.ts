import { Duration, Stack, StackProps } from 'aws-cdk-lib/core';
import {Function, Code, Runtime} from 'aws-cdk-lib/aws-lambda'
import { Construct } from 'constructs';
import { LambdaRestApi } from 'aws-cdk-lib/aws-apigateway';
import { HitCounter } from './hitcounter';

export class CdkWorkshopStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const hello = new Function(this, "HelloHandler", {
      runtime: Runtime.NODEJS_22_X,
      code: Code.fromAsset('lambda'),
      handler: 'hello.handler'
    })

    const helloWithCounter = new HitCounter(this, "HelloHitCounter", {
      downstream: hello,
    });

    // defines an API Gateway REST API resource backed by our "hello" function.
    const gateway = new LambdaRestApi(this, "Endpoint", {
      handler: helloWithCounter.handler,
    });
  }
}
