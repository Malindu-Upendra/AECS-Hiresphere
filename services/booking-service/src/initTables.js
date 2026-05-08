const { CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });

const tables = [
  {
    TableName: process.env.BOOKINGS_TABLE || 'hiresphere-bookings',
    AttributeDefinitions: [{ AttributeName: 'bookingId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'bookingId', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: process.env.SLOTS_TABLE || 'hiresphere-slots',
    AttributeDefinitions: [{ AttributeName: 'slotId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'slotId', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: process.env.PACKAGES_TABLE || 'hiresphere-packages',
    AttributeDefinitions: [{ AttributeName: 'packageId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'packageId', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: process.env.PURCHASES_TABLE || 'hiresphere-purchases',
    AttributeDefinitions: [{ AttributeName: 'purchaseId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'purchaseId', KeyType: 'HASH' }],
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
