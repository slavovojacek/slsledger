import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import AWSXRay from 'aws-xray-sdk-core';

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const capturedDdbClient = AWSXRay.captureAWSv3Client(ddbClient);
export default DynamoDBDocumentClient.from(capturedDdbClient);
