import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { join } from 'path';

type Props = {
  region: string;
  tableName: string;
};

export class Lambdas extends Construct {
  private static readonly pathToFunctions = join(__dirname, 'functions');
  createAccountLambda: cdk.aws_lambda.Function;
  createAccountLambdaSchema: cdk.aws_apigateway.JsonSchema;
  transferFundsLambda: cdk.aws_lambda.Function;
  transferFundsLambdaSchema: cdk.aws_apigateway.JsonSchema;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const functionProps = {
      runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
      architecture: cdk.aws_lambda.Architecture.ARM_64,
      memorySize: 1024,
      tracing: cdk.aws_lambda.Tracing.ACTIVE,
      timeout: cdk.Duration.seconds(3),
      reservedConcurrentExecutions: 2, // Hard limit for scaling in case of traffic spikes (demonstration only)
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      insightsVersion: cdk.aws_lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      code: cdk.aws_lambda.Code.fromAsset(Lambdas.pathToFunctions),
      environment: {
        REGION: props.region,
        TABLE_NAME: props.tableName,
      },
    };

    this.newCreateAccountLambda({
      ...functionProps,
      handler: 'createAccount.handler',
    });

    this.newTransferFundsLambda({
      ...functionProps,
      handler: 'transferFunds.handler',
    });
  }

  private newCreateAccountLambda(props: cdk.aws_lambda.FunctionProps) {
    this.createAccountLambda = new cdk.aws_lambda.Function(this, 'CreateAccountLambda', props);

    this.createAccountLambdaSchema = {
      type: cdk.aws_apigateway.JsonSchemaType.OBJECT,
      properties: {
        name: {
          type: cdk.aws_apigateway.JsonSchemaType.STRING,
          minLength: 2,
          maxLength: 128,
        },
        denomination: {
          type: cdk.aws_apigateway.JsonSchemaType.STRING,
          minLength: 2,
          maxLength: 5,
        },
      },
      required: ['name', 'denomination'],
      additionalProperties: false,
    };
  }

  private newTransferFundsLambda(props: cdk.aws_lambda.FunctionProps) {
    this.transferFundsLambda = new cdk.aws_lambda.Function(this, 'TransferFundsLambda', props);

    this.transferFundsLambdaSchema = {
      type: cdk.aws_apigateway.JsonSchemaType.OBJECT,
      properties: {
        debtorAccountId: {
          type: cdk.aws_apigateway.JsonSchemaType.STRING,
          minLength: 8,
          maxLength: 128,
        },
        creditorAccountId: {
          type: cdk.aws_apigateway.JsonSchemaType.STRING,
          minLength: 8,
          maxLength: 128,
        },
        amount: { type: cdk.aws_apigateway.JsonSchemaType.NUMBER },
        denomination: {
          type: cdk.aws_apigateway.JsonSchemaType.STRING,
          minLength: 2,
          maxLength: 5,
        },
      },
      required: ['debtorAccountId', 'creditorAccountId', 'amount', 'denomination'],
      additionalProperties: false,
    };
  }
}