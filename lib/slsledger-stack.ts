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
    this.newRestApi(props.restApiStageName);
    this.newLambdas();
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
    });

    this.restApiRequestValidator = this.restApi.addRequestValidator('RestApiRequestValidator', {
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    this.restApi.root.addMethod('ANY', new cdk.aws_apigateway.MockIntegration());
  }

  private newLambdas() {
    this.lambdas = new Lambdas(this, 'Lambdas', {
      region: this.region,
      tableName: this.dynamoTable.tableName,
    });

    this.dynamoTable.grantWriteData(this.lambdas.createAccountLambda);
    this.dynamoTable.grantWriteData(this.lambdas.transferFundsLambda);
  }
}
