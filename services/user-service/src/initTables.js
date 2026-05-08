const { CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });

const tables = [
  {
    TableName: process.env.USERS_TABLE || 'hiresphere-users',
    AttributeDefinitions: [{ AttributeName: 'userId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
];

async function tableExists(name) {
  try {
    await client.send(new DescribeTableCommand({ TableName: name }));
    return true;
  } catch {
    return false;
  }
}

async function initTables() {
  for (const table of tables) {
    if (await tableExists(table.TableName)) {
      console.log(`Table exists: ${table.TableName}`);
    } else {
      await client.send(new CreateTableCommand(table));
      console.log(`Table created: ${table.TableName}`);
    }
  }
}

module.exports = { initTables };
