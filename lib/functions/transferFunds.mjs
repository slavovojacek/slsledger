import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

import ddbDocClient from './ddb.mjs';

export const handler = async ({ body }) => {
  const { debtorAccountId, creditorAccountId, amount, denomination } = JSON.parse(body);

  // Create two transactions so that individual account holders can view the full history of credits and debits
  const debitTransaction = newTransaction(debtorAccountId, amount, denomination);
  const creditTransaction = newTransaction(creditorAccountId, amount, denomination, true);

  const debtorAccountUpdateInput = {
    TableName: process.env.TABLE_NAME,
    Key: {
      pk: `Account#${debtorAccountId}`,
      sk: `Account#${debtorAccountId}`,
    },
    // Perform balance update in form of deduction
    UpdateExpression: 'SET #balance = #balance - :amount',
    // Perform balance check and denomination equality check
    ConditionExpression: '#balance > :amount AND #denomination = :denomination',
    ExpressionAttributeNames: {
      '#balance': 'balance',
      '#denomination': 'denomination',
    },
    ExpressionAttributeValues: {
      ':amount': amount,
      ':denomination': denomination,
    },
  };

  const creditorAccountUpdateInput = {
    TableName: process.env.TABLE_NAME,
    Key: {
      pk: `Account#${creditorAccountId}`,
      sk: `Account#${creditorAccountId}`,
    },
    // Perform balance update in form of credit
    UpdateExpression: 'SET #balance = #balance + :amount',
    // Perform denomination equality check
    ConditionExpression: '#denomination = :denomination',
    ExpressionAttributeNames: {
      '#balance': 'balance',
      '#denomination': 'denomination',
    },
    ExpressionAttributeValues: {
      ':amount': amount,
      ':denomination': denomination,
    },
  };

  const cmd = new TransactWriteCommand({
    TransactItems: [
      { Put: debitTransaction.input },
      { Update: debtorAccountUpdateInput },
      { Put: creditTransaction.input },
      { Update: creditorAccountUpdateInput },
    ],
  });

  await ddbDocClient.send(cmd);

  return {
    statusCode: 201,
    body: JSON.stringify({
      transactions: [
        { id: debitTransaction.id, credit: false },
        { id: creditTransaction.id, credit: true },
      ],
    }),
  };
};

const newTransaction = (accountId, amount, denomination, credit = false) => {
  const id = randomUUID();

  const input = {
    TableName: process.env.TABLE_NAME,
    Item: {
      pk: `Account#${accountId}`,
      sk: `Transaction#${id}`,
      type: 'Transaction',
      insertedAt: Date.now(),
      amount,
      denomination,
      credit,
    },
  };

  return { id, input };
};
