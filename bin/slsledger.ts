#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ServerlessLedgerStack } from '../lib/slsledger-stack';

const app = new cdk.App();

new ServerlessLedgerStack(app, 'LedgerDev', {
  env: { region: 'eu-west-2' },
  restApiStageName: 'dev',
});
