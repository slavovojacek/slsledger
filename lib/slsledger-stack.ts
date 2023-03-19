import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Lambdas } from './lambdas';

type StackProps = cdk.StackProps & { restApiStageName: string };

export class ServerlessLedgerStack extends cdk.Stack {
  private dynamoTable: cdk.aws_dynamodb.Table;
  private restApi: cdk.aws_apigateway.RestApi;
  private restApiRequestValidator: cdk.aws_apigateway.RequestValidator;
  private lambdas: Lambdas;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.newDynamoTable();
    this.newLambdas();
    this.newRestApi(props.restApiStageName);
    this.newWaf();
  }

  private newDynamoTable() {
    this.dynamoTable = new cdk.aws_dynamodb.Table(this, 'DynamoTable', {
      partitionKey: { name: 'pk', type: cdk.aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: cdk.aws_dynamodb.AttributeType.STRING },
      encryption: cdk.aws_dynamodb.TableEncryption.AWS_MANAGED,
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }

  private newRestApi(stageName: string) {
    this.restApi = new cdk.aws_apigateway.RestApi(this, 'RestApi', {
      deployOptions: {
        stageName,
        tracingEnabled: true,
        metricsEnabled: true,
      },
      defaultMethodOptions: {
        apiKeyRequired: true, // API Key is required for all methods
      },
    });

    this.restApiRequestValidator = this.restApi.addRequestValidator('RestApiRequestValidator', {
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    this.restApi.root
      .resourceForPath('/accounts')
      .addMethod('POST', new cdk.aws_apigateway.LambdaIntegration(this.lambdas.createAccountLambda), {
        requestValidator: this.restApiRequestValidator,
        requestModels: {
          'application/json': new cdk.aws_apigateway.Model(this, 'CreateAccountLambdaModel', {
            restApi: this.restApi,
            schema: this.lambdas.createAccountLambdaSchema,
          }),
        },
      });

    this.restApi.root
      .resourceForPath('/transfers')
      .addMethod('POST', new cdk.aws_apigateway.LambdaIntegration(this.lambdas.transferFundsLambda), {
        requestValidator: this.restApiRequestValidator,
        requestModels: {
          'application/json': new cdk.aws_apigateway.Model(this, 'TransferFundsLambdaModel', {
            restApi: this.restApi,
            schema: this.lambdas.transferFundsLambdaSchema,
          }),
        },
      });

    const restApiUsagePlan = new cdk.aws_apigateway.UsagePlan(this, 'RestApiUsagePlan', {
      name: 'Default',
      throttle: {
        rateLimit: 5,
        burstLimit: 2,
      },
      quota: {
        limit: 100,
        period: cdk.aws_apigateway.Period.DAY,
      },
    });

    restApiUsagePlan.addApiStage({ stage: this.restApi.deploymentStage });

    const apiKey = this.restApi.addApiKey('TestApiKey');
    restApiUsagePlan.addApiKey(apiKey);
  }

  private newLambdas() {
    this.lambdas = new Lambdas(this, 'Lambdas', {
      region: this.region,
      tableName: this.dynamoTable.tableName,
    });

    this.dynamoTable.grantWriteData(this.lambdas.createAccountLambda);
    this.dynamoTable.grantWriteData(this.lambdas.transferFundsLambda);
  }

  private newWaf() {
    const rules: Array<cdk.aws_wafv2.CfnWebACL.RuleProperty> = [
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

    const waf = new cdk.aws_wafv2.CfnWebACL(this, 'Waf', {
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

    new cdk.aws_wafv2.CfnWebACLAssociation(this, 'RestApiAssociation', {
      webAclArn: waf.attrArn,
      resourceArn: restApiArn,
    });
  }
}
