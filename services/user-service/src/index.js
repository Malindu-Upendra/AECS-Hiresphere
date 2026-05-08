require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const { PutCommand, GetCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('./db');
const { authenticate } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3002;
const TABLE = process.env.USERS_TABLE || 'hiresphere-users';

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Create or update profile after Cognito signup
app.post('/users/profile', authenticate, async (req, res) => {
  const { role, name, bio, domain, interviewTypes, experienceLevel, hourlyRate } = req.body;
  const cognitoSub = req.user.sub;

  if (!['candidate', 'interviewer'].includes(role)) {
    return res.status(400).json({ error: 'role must be candidate or interviewer' });
  }

  const item = {
    userId: cognitoSub,
    role,
    name,
    bio: bio || '',
    email: req.user.email || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(role === 'interviewer' && { domain, interviewTypes, experienceLevel, hourlyRate, rating: 0, totalReviews: 0 }),
  };

  await docClient.send(new PutCommand({ TableName: TABLE, Item: item }));
  res.status(201).json(item);
});

// Get own profile
app.get('/users/me', authenticate, async (req, res) => {
  const { Item } = await docClient.send(new GetCommand({ TableName: TABLE, Key: { userId: req.user.sub } }));
  if (!Item) return res.status(404).json({ error: 'Profile not found' });
  res.json(Item);
});

// Get any user by ID
app.get('/users/:userId', authenticate, async (req, res) => {
  const { Item } = await docClient.send(new GetCommand({ TableName: TABLE, Key: { userId: req.params.userId } }));
  if (!Item) return res.status(404).json({ error: 'User not found' });
  res.json(Item);
});

// Search interviewers with filters
app.get('/users/interviewers/search', authenticate, async (req, res) => {
  const { domain, interviewType, experienceLevel } = req.query;

  const { Items } = await docClient.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: '#role = :role',
    ExpressionAttributeNames: { '#role': 'role' },
    ExpressionAttributeValues: { ':role': 'interviewer' },
  }));

  let results = Items || [];
  if (domain) results = results.filter(u => u.domain === domain);
  if (interviewType) results = results.filter(u => u.interviewTypes?.includes(interviewType));
  if (experienceLevel) results = results.filter(u => u.experienceLevel === experienceLevel);

  res.json(results);
});

// Update profile
app.put('/users/me', authenticate, async (req, res) => {
  const { name, bio, domain, interviewTypes, experienceLevel, hourlyRate } = req.body;

  await docClient.send(new UpdateCommand({
    TableName: TABLE,
    Key: { userId: req.user.sub },
    UpdateExpression: 'SET #n = :name, bio = :bio, updatedAt = :updatedAt, domain = :domain, interviewTypes = :interviewTypes, experienceLevel = :experienceLevel, hourlyRate = :hourlyRate',
    ExpressionAttributeNames: { '#n': 'name' },
    ExpressionAttributeValues: {
      ':name': name,
      ':bio': bio,
      ':domain': domain,
      ':interviewTypes': interviewTypes,
      ':experienceLevel': experienceLevel,
      ':hourlyRate': hourlyRate,
      ':updatedAt': new Date().toISOString(),
    },
  }));

  res.json({ message: 'Profile updated' });
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'user-service' }));

const { initTables } = require('./initTables');

initTables()
  .then(() => app.listen(PORT, () => console.log(`User service running on port ${PORT}`)))
  .catch(err => { console.error('Failed to init tables:', err); process.exit(1); });
