import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as aws_dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as aws_lambda from 'aws-cdk-lib/aws-lambda';
import * as aws_logs from 'aws-cdk-lib/aws-logs';
import * as aws_apigw from 'aws-cdk-lib/aws-apigateway';
import * as aws_waf from 'aws-cdk-lib/aws-wafv2';
import { join } from 'path'

export class SlsledgerStack extends cdk.Stack {
  private readonly dynamoTable: aws_dynamodb.Table;
  private readonly createAccountLambda: aws_lambda.Function;
  private readonly transferFundsLambda: aws_lambda.Function;
  private readonly restApi: aws_apigw.RestApi;
  private readonly restApiRequestValidator: aws_apigw.RequestValidator;
  private readonly restApiUsagePlan: aws_apigw.UsagePlan;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.dynamoTable = new aws_dynamodb.Table(this, 'DynamoTable', {
      partitionKey: { name: 'pk', type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: aws_dynamodb.AttributeType.STRING },
      encryption: aws_dynamodb.TableEncryption.AWS_MANAGED,
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.createAccountLambda = this.newCreateAccountLambda();
    this.dynamoTable.grantWriteData(this.createAccountLambda);

    this.transferFundsLambda = this.newTransferFundsLambda();
    this.dynamoTable.grantWriteData(this.transferFundsLambda);

    this.restApi = this.newRestApi('dev');

    this.restApiRequestValidator = this.restApi.addRequestValidator('RestApiRequestValidator', {
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    this.restApiUsagePlan = new aws_apigw.UsagePlan(this, 'RestApiUsagePlan', {
      name: 'Default',
      throttle: {
        rateLimit: 5,
        burstLimit: 2,
      },
      quota: {
        limit: 100,
        period: aws_apigw.Period.DAY,
      },
    });

    this.restApiUsagePlan.addApiStage({
      stage: this.restApi.deploymentStage,
    });

    this.newRestApiKey('Slavo');

    const contentType = 'application/json';

    const createAccountOpts = {
      requestValidator: this.restApiRequestValidator,
      requestModels: {
        [contentType]: new aws_apigw.Model(this, 'CreateAccountLambdaModel', {
          restApi: this.restApi,
          contentType,
          schema: {
            type: aws_apigw.JsonSchemaType.OBJECT,
            properties: {
              name: {
                type: aws_apigw.JsonSchemaType.STRING,
                minLength: 2,
                maxLength: 128,
              },
              denomination: {
                type: aws_apigw.JsonSchemaType.STRING,
                minLength: 2,
                maxLength: 5,
              },
            },
            required: ['name', 'denomination'],
            additionalProperties: false,
          },
        }),
      },
    };

    const transferFundsOpts = {
      requestValidator: this.restApiRequestValidator,
      requestModels: {
        [contentType]: new aws_apigw.Model(this, 'TransferFundsLambdaModel', {
          restApi: this.restApi,
          contentType,
          schema: {
            type: aws_apigw.JsonSchemaType.OBJECT,
            properties: {
              debtorAccountId: {
                type: aws_apigw.JsonSchemaType.STRING,
                minLength: 8,
                maxLength: 128,
              },
              creditorAccountId: {
                type: aws_apigw.JsonSchemaType.STRING,
                minLength: 8,
                maxLength: 128,
              },
              amount: { type: aws_apigw.JsonSchemaType.NUMBER },
              denomination: {
                type: aws_apigw.JsonSchemaType.STRING,
                minLength: 2,
                maxLength: 5,
              },
            },
            required: ['debtorAccountId', 'creditorAccountId', 'amount', 'denomination'],
            additionalProperties: false,
          },
        }),
      },
    };

    this.restApi.root.resourceForPath('/accounts').addMethod('POST', new aws_apigw.LambdaIntegration(this.createAccountLambda), createAccountOpts);
    this.restApi.root.resourceForPath('/transfers').addMethod('POST', new aws_apigw.LambdaIntegration(this.transferFundsLambda), transferFundsOpts);

    this.newRestApiWaf();
  }

  private newRestApiKey = (clientName: string) => {
    const name = clientName + 'RestApiKey';
    const apiKey = this.restApi.addApiKey(name);
    this.restApiUsagePlan.addApiKey(apiKey);
    new cdk.CfnOutput(this, name + 'Id', { value: apiKey.keyId });
  };

  private newCreateAccountLambda(): aws_lambda.Function {
    const func = new aws_lambda.Function(this, 'CreateAccountLambda', {
      ...this.lambdaProps(),
      handler: 'createAccount.handler',
    });

    return func;
  }

  private newTransferFundsLambda(): aws_lambda.Function {
    const func = new aws_lambda.Function(this, 'TransferFundsLambda', {
      ...this.lambdaProps(),
      handler: 'transferFunds.handler',
    });

    return func;
  }

  private lambdaProps() {
    return {
      runtime: aws_lambda.Runtime.NODEJS_18_X,
      architecture: aws_lambda.Architecture.ARM_64,
      memorySize: 1024,
      tracing: aws_lambda.Tracing.ACTIVE,
      timeout: cdk.Duration.seconds(3),
      // Hard limit for scaling in case of traffic spikes (demonstration only)
      reservedConcurrentExecutions: 2,
      logRetention: aws_logs.RetentionDays.ONE_WEEK,
      insightsVersion: aws_lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      code: aws_lambda.Code.fromAsset(join(__dirname, 'functions')),
      environment: {
        REGION: this.region,
        TABLE_NAME: this.dynamoTable.tableName,
      },
    }
  }

  private newRestApi(stageName: string) {
    const restApi = new aws_apigw.RestApi(this, 'RestApi', {
      deployOptions: {
        stageName,
        tracingEnabled: true,
        metricsEnabled: true,
      },
      defaultMethodOptions: {
        // All methods will require api key authentication
        apiKeyRequired: true,
      },
    });

    return restApi
  }

  private newRestApiWaf = () => {
    const rules: Array<aws_waf.CfnWebACL.RuleProperty> = [
      {
        name: 'AWSManagedRulesCommonRuleSet',
        priority: 1,
        overrideAction: { none: {} },
        statement: {
          managedRuleGroupStatement: {
            name: 'AWSManagedRulesCommonRuleSet',
            vendorName: 'AWS',
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'AWSManagedRulesCommonRuleSet',
          sampledRequestsEnabled: true,
        },
      },
      {
        name: 'IPRateLimit',
        priority: 2,
        action: {
          block: {},
        },
        statement: {
          rateBasedStatement: {
            aggregateKeyType: 'IP',
            limit: 1_000,
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'IPRateLimit',
          sampledRequestsEnabled: true,
        },
      },
    ];

    const waf = new aws_waf.CfnWebACL(this, 'RestApiWaf', {
      defaultAction: {
        allow: {},
      },
      scope: 'REGIONAL',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'WebACL',
        sampledRequestsEnabled: true,
      },
      rules,
    });

    const restApiArn = [
      `arn:aws:apigateway:${this.region}::`,
      'restapis',
      this.restApi.restApiId,
      'stages',
      this.restApi.deploymentStage.stageName,
    ].join('/');

    new aws_waf.CfnWebACLAssociation(this, 'RestApiWebAclAssociation', {
      webAclArn: waf.attrArn,
      resourceArn: restApiArn,
    });

    return waf;
  };
}
