require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { PutCommand, GetCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { S3Client } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { CognitoJwtVerifier } = require('aws-jwt-verify');

const app = express();
const PORT = process.env.PORT || 3005;
const SUBMISSIONS_TABLE = process.env.SUBMISSIONS_TABLE || 'hiresphere-submissions';
const TASKS_TABLE = process.env.TASKS_TABLE || 'hiresphere-tasks';
const S3_BUCKET = process.env.S3_BUCKET || 'hiresphere-submissions';

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  tokenUse: 'access',
  clientId: process.env.COGNITO_CLIENT_ID,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

// --- Task endpoints ---

app.get('/tasks', authenticate, async (req, res) => {
  const { difficulty, tag } = req.query;
  let filterExp = [];
  const expAttrVals = {};

  if (difficulty) {
    filterExp.push('difficulty = :diff');
    expAttrVals[':diff'] = difficulty;
  }
  if (tag) {
    filterExp.push('contains(tags, :tag)');
    expAttrVals[':tag'] = tag;
  }

  const params = { TableName: TASKS_TABLE };
  if (filterExp.length) {
    params.FilterExpression = filterExp.join(' AND ');
    params.ExpressionAttributeValues = expAttrVals;
  }

  const { Items } = await docClient.send(new ScanCommand(params));
  res.json(Items || []);
});

app.get('/tasks/:taskId', authenticate, async (req, res) => {
  const { Item } = await docClient.send(new GetCommand({
    TableName: TASKS_TABLE,
    Key: { taskId: req.params.taskId },
  }));
  if (!Item) return res.status(404).json({ error: 'Task not found' });
  res.json(Item);
});

// Interviewer: create a new practical/task
app.post('/tasks', authenticate, async (req, res) => {
  const { title, description, difficulty, timeLimit, tags, evaluationCriteria } = req.body;
  if (!title?.trim() || !description?.trim() || !difficulty) {
    return res.status(400).json({ error: 'title, description, and difficulty are required.' });
  }
  const task = {
    taskId: uuidv4(),
    title: title.trim(),
    description: description.trim(),
    difficulty,
    timeLimit: Number(timeLimit) || 60,
    tags: Array.isArray(tags) ? tags : [],
    evaluationCriteria: Array.isArray(evaluationCriteria) ? evaluationCriteria : [],
    type: 'interviewer',
    createdBy: req.user.sub,
    createdAt: new Date().toISOString(),
  };
  await docClient.send(new PutCommand({ TableName: TASKS_TABLE, Item: task }));
  res.status(201).json(task);
});

// --- Submission endpoints ---

app.post('/submissions/upload', authenticate, upload.single('file'), async (req, res) => {
  const { taskId, githubUrl } = req.body;

  if (!taskId) return res.status(400).json({ error: 'taskId is required' });
  if (!req.file && !githubUrl) return res.status(400).json({ error: 'file or githubUrl required' });

  const { Item: task } = await docClient.send(new GetCommand({
    TableName: TASKS_TABLE,
    Key: { taskId },
  }));
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const submissionId = uuidv4();
  let s3Key = null;

  if (req.file) {
    s3Key = `submissions/${req.user.sub}/${submissionId}/${req.file.originalname}`;
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ServerSideEncryption: 'AES256',
    }));
  }

  const submission = {
    submissionId,
    candidateId: req.user.sub,
    taskId,
    taskTitle: task.title,
    taskCreatedBy: task.createdBy || 'system',
    s3Key,
    githubUrl: githubUrl || null,
    status: 'submitted',
    annotation: null,
    evaluation: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await docClient.send(new PutCommand({ TableName: SUBMISSIONS_TABLE, Item: submission }));
  res.status(201).json(submission);
});

app.get('/submissions/:submissionId/download', authenticate, async (req, res) => {
  const { Item } = await docClient.send(new GetCommand({
    TableName: SUBMISSIONS_TABLE,
    Key: { submissionId: req.params.submissionId },
  }));

  if (!Item) return res.status(404).json({ error: 'Submission not found' });
  if (!Item.s3Key) return res.status(400).json({ error: 'No file attached to this submission' });

  const url = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: S3_BUCKET, Key: Item.s3Key }), { expiresIn: 3600 });
  res.json({ url });
});

// Get all submissions for the current candidate
app.get('/submissions', authenticate, async (req, res) => {
  const { Items } = await docClient.send(new ScanCommand({
    TableName: SUBMISSIONS_TABLE,
    FilterExpression: 'candidateId = :uid',
    ExpressionAttributeValues: { ':uid': req.user.sub },
  }));
  res.json(Items || []);
});

// Interviewer: get all submissions for tasks they created (must be before /:submissionId)
app.get('/submissions/for-review', authenticate, async (req, res) => {
  const { Items: myTasks } = await docClient.send(new ScanCommand({
    TableName: TASKS_TABLE,
    FilterExpression: 'createdBy = :uid',
    ExpressionAttributeValues: { ':uid': req.user.sub },
  }));

  if (!myTasks || myTasks.length === 0) return res.json([]);

  const taskIds = new Set(myTasks.map(t => t.taskId));
  const { Items: allSubs } = await docClient.send(new ScanCommand({ TableName: SUBMISSIONS_TABLE }));
  res.json((allSubs || []).filter(s => taskIds.has(s.taskId)));
});

// Get all submissions for a specific task (must be before /:submissionId)
app.get('/submissions/task/:taskId', authenticate, async (req, res) => {
  const { Items } = await docClient.send(new ScanCommand({
    TableName: SUBMISSIONS_TABLE,
    FilterExpression: 'taskId = :tid',
    ExpressionAttributeValues: { ':tid': req.params.taskId },
  }));
  res.json(Items || []);
});

// Get a single submission by ID
app.get('/submissions/:submissionId', authenticate, async (req, res) => {
  const { Item } = await docClient.send(new GetCommand({
    TableName: SUBMISSIONS_TABLE,
    Key: { submissionId: req.params.submissionId },
  }));
  if (!Item) return res.status(404).json({ error: 'Submission not found' });
  res.json(Item);
});

// Legacy: plain text annotation
app.patch('/submissions/:submissionId/annotate', authenticate, async (req, res) => {
  const { annotation } = req.body;
  if (!annotation) return res.status(400).json({ error: 'annotation required' });

  await docClient.send(new UpdateCommand({
    TableName: SUBMISSIONS_TABLE,
    Key: { submissionId: req.params.submissionId },
    UpdateExpression: 'SET annotation = :a, #s = :status, updatedAt = :updatedAt',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':a': annotation,
      ':status': 'reviewed',
      ':updatedAt': new Date().toISOString(),
    },
  }));

  res.json({ message: 'Annotation saved' });
});

// Interviewer: submit structured evaluation report
app.patch('/submissions/:submissionId/evaluate', authenticate, async (req, res) => {
  const { evaluation } = req.body;
  if (!evaluation) return res.status(400).json({ error: 'evaluation required' });

  const { Item } = await docClient.send(new GetCommand({
    TableName: SUBMISSIONS_TABLE,
    Key: { submissionId: req.params.submissionId },
  }));
  if (!Item) return res.status(404).json({ error: 'Submission not found' });

  const fullEvaluation = {
    ...evaluation,
    reviewedAt: new Date().toISOString(),
    reviewedBy: req.user.sub,
  };

  await docClient.send(new UpdateCommand({
    TableName: SUBMISSIONS_TABLE,
    Key: { submissionId: req.params.submissionId },
    UpdateExpression: 'SET evaluation = :ev, #s = :status, updatedAt = :updatedAt',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':ev': fullEvaluation,
      ':status': 'reviewed',
      ':updatedAt': new Date().toISOString(),
    },
  }));

  res.json({ message: 'Evaluation saved', evaluation: fullEvaluation });
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'submission-service' }));

const { initTables } = require('./initTables');

initTables()
  .then(() => app.listen(PORT, () => console.log(`Submission service running on port ${PORT}`)))
  .catch(err => { console.error('Failed to init tables:', err); process.exit(1); });
