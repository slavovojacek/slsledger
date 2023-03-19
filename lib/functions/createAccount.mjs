import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

import ddbDocClient from './ddb.mjs';

export const handler = async ({ body }) => {
  const { name, denomination } = JSON.parse(body);

  const id = randomUUID();

  const cmd = new PutCommand({
    TableName: process.env.TABLE_NAME,
    Item: {
      pk: `Account#${id}`,
      sk: `Account#${id}`,
      type: 'Account',
      insertedAt: Date.now(),
      name,
      denomination,
      balance: 0,
    },
  });

  await ddbDocClient.send(cmd);

  return {
    statusCode: 201,
    body: JSON.stringify({ id }),
  };
};
