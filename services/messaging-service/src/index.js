require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const { PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { CognitoJwtVerifier } = require('aws-jwt-verify');

const app = express();
const PORT = process.env.PORT || 3004;
const MESSAGES_TABLE = process.env.MESSAGES_TABLE || 'hiresphere-messages';
const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE || 'hiresphere-bookings';

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  tokenUse: 'access',
  clientId: process.env.COGNITO_CLIENT_ID,
});

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

async function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = await verifier.verify(auth.split(' ')[1]);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Send a message to another user
app.post('/messages', authenticate, async (req, res) => {
  const { recipientId, content } = req.body;
  if (!recipientId || !content) return res.status(400).json({ error: 'recipientId and content required' });

  // Only allow messaging between users who share a booking
  const { Items: bookings } = await docClient.send(new ScanCommand({
    TableName: BOOKINGS_TABLE,
    FilterExpression: '(candidateId = :me AND interviewerId = :them) OR (candidateId = :them AND interviewerId = :me)',
    ExpressionAttributeValues: { ':me': req.user.sub, ':them': recipientId },
  }));
  if (!bookings || bookings.length === 0) {
    return res.status(403).json({ error: 'You can only message users you have a booking with.' });
  }

  // Conversation ID is deterministic — same regardless of who sends
  const participants = [req.user.sub, recipientId].sort();
  const conversationId = participants.join('#');

  const message = {
    messageId: uuidv4(),
    conversationId,
    senderId: req.user.sub,
    recipientId,
    content,
    createdAt: new Date().toISOString(),
    read: false,
  };

  await docClient.send(new PutCommand({ TableName: MESSAGES_TABLE, Item: message }));
  res.status(201).json(message);
});

// Get all messages in a conversation with another user
app.get('/messages/:otherUserId', authenticate, async (req, res) => {
  const participants = [req.user.sub, req.params.otherUserId].sort();
  const conversationId = participants.join('#');

  const { Items } = await docClient.send(new ScanCommand({
    TableName: MESSAGES_TABLE,
    FilterExpression: 'conversationId = :cid',
    ExpressionAttributeValues: { ':cid': conversationId },
  }));

  const sorted = (Items || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json(sorted);
});

// Get all conversations (distinct partners) for current user
app.get('/messages', authenticate, async (req, res) => {
  const { Items } = await docClient.send(new ScanCommand({
    TableName: MESSAGES_TABLE,
    FilterExpression: 'senderId = :uid OR recipientId = :uid',
    ExpressionAttributeValues: { ':uid': req.user.sub },
  }));

  // Return latest message per conversation
  const convMap = {};
  for (const msg of Items || []) {
    const prev = convMap[msg.conversationId];
    if (!prev || msg.createdAt > prev.createdAt) convMap[msg.conversationId] = msg;
  }

  res.json(Object.values(convMap));
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'messaging-service' }));

const { initTables } = require('./initTables');

initTables()
  .then(() => app.listen(PORT, () => console.log(`Messaging service running on port ${PORT}`)))
  .catch(err => { console.error('Failed to init tables:', err); process.exit(1); });
