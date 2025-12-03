#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { CdkWorkshopStack } from '../lib/cdk-workshop-stack';

const app = new cdk.App();
new CdkWorkshopStack(app, 'CdkWorkshopStack');
