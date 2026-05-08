require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const { PutCommand, GetCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { CognitoJwtVerifier } = require('aws-jwt-verify');

const app = express();
const PORT = process.env.PORT || 3003;
const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE || 'hiresphere-bookings';
const SLOTS_TABLE = process.env.SLOTS_TABLE || 'hiresphere-slots';
const PACKAGES_TABLE = process.env.PACKAGES_TABLE || 'hiresphere-packages';
const PURCHASES_TABLE = process.env.PURCHASES_TABLE || 'hiresphere-purchases';
const BOOKING_EVENTS_QUEUE = process.env.BOOKING_EVENTS_QUEUE_URL;

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

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

async function publishEvent(type, payload) {
  if (!BOOKING_EVENTS_QUEUE) return;
  try {
    await sqsClient.send(new SendMessageCommand({
      QueueUrl: BOOKING_EVENTS_QUEUE,
      MessageBody: JSON.stringify({ type, payload, timestamp: new Date().toISOString() }),
    }));
  } catch {}
}

// --- Card validation helpers ---

function getCardType(number) {
  const n = number.replace(/\D/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^5[1-5]/.test(n) || /^2(2[2-9][1-9]|[3-6]\d{2}|7[01]\d|720)/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^(6011|65|64[4-9]|622)/.test(n)) return 'discover';
  return null;
}

function luhnCheck(number) {
  const digits = number.replace(/\D/g, '').split('').reverse().map(Number);
  if (digits.length < 13) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits[i];
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

function validateCard({ cardNumber, cardExpiry, cardCvv, cardHolder }) {
  if (!cardHolder?.trim()) return 'Cardholder name is required.';

  const digits = cardNumber.replace(/\D/g, '');
  const cardType = getCardType(digits);
  if (!cardType) return 'Unrecognised card type.';

  const expectedLength = cardType === 'amex' ? 15 : 16;
  if (digits.length !== expectedLength) return `Card number must be ${expectedLength} digits.`;
  if (!luhnCheck(digits)) return 'Invalid card number.';

  const expiryMatch = cardExpiry.match(/^(\d{2})\/(\d{2})$/);
  if (!expiryMatch) return 'Expiry must be MM/YY.';
  const expMonth = parseInt(expiryMatch[1], 10);
  const expYear = 2000 + parseInt(expiryMatch[2], 10);
  if (expMonth < 1 || expMonth > 12) return 'Invalid expiry month.';
  const now = new Date();
  if (expYear < now.getFullYear() || (expYear === now.getFullYear() && expMonth < now.getMonth() + 1)) {
    return 'Card has expired.';
  }

  const cvvLength = cardType === 'amex' ? 4 : 3;
  if (!/^\d+$/.test(cardCvv) || cardCvv.length !== cvvLength) {
    return `CVV must be ${cvvLength} digits for ${cardType}.`;
  }

  return null;
}

// --- Slot endpoints ---

app.post('/bookings/slots', authenticate, async (req, res) => {
  const { startTime, endTime, price } = req.body;
  const slotId = uuidv4();
  const slot = {
    slotId,
    interviewerId: req.user.sub,
    startTime,
    endTime,
    price,
    status: 'available',
    createdAt: new Date().toISOString(),
  };
  await docClient.send(new PutCommand({ TableName: SLOTS_TABLE, Item: slot }));
  res.status(201).json(slot);
});

app.get('/bookings/slots/:interviewerId', authenticate, async (req, res) => {
  const { Items } = await docClient.send(new ScanCommand({
    TableName: SLOTS_TABLE,
    FilterExpression: 'interviewerId = :id AND #s = :status',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':id': req.params.interviewerId, ':status': 'available' },
  }));
  res.json(Items || []);
});

// --- Booking endpoints ---

// Candidate: book and pay in one step
app.post('/bookings', authenticate, async (req, res) => {
  const { interviewerId, slotId, sessionType, cardNumber, cardExpiry, cardCvv, cardHolder } = req.body;

  if (!interviewerId || !slotId || !sessionType) {
    return res.status(400).json({ error: 'interviewerId, slotId and sessionType are required.' });
  }

  // Validate card
  const cardError = validateCard({ cardNumber: cardNumber || '', cardExpiry: cardExpiry || '', cardCvv: cardCvv || '', cardHolder: cardHolder || '' });
  if (cardError) return res.status(400).json({ error: cardError });

  // Fetch slot to get time info and atomically mark it as booked
  const { Item: slot } = await docClient.send(new GetCommand({
    TableName: SLOTS_TABLE,
    Key: { slotId },
  }));
  if (!slot) return res.status(404).json({ error: 'Slot not found.' });

  try {
    await docClient.send(new UpdateCommand({
      TableName: SLOTS_TABLE,
      Key: { slotId },
      UpdateExpression: 'SET #s = :booked',
      ConditionExpression: '#s = :available',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':booked': 'booked', ':available': 'available' },
    }));
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return res.status(409).json({ error: 'This slot has already been booked. Please choose another.' });
    }
    throw err;
  }

  const bookingId = uuidv4();
  const booking = {
    bookingId,
    candidateId: req.user.sub,
    interviewerId,
    slotId,
    startTime: slot.startTime,
    endTime: slot.endTime,
    sessionType,
    status: 'confirmed',
    sessionEnabled: false,
    paymentStatus: 'paid',
    cardLast4: cardNumber.replace(/\D/g, '').slice(-4),
    cardType: getCardType(cardNumber),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await docClient.send(new PutCommand({ TableName: BOOKINGS_TABLE, Item: booking }));
  await publishEvent('BOOKING_CONFIRMED', booking);
  res.status(201).json(booking);
});

// --- Package endpoints ---

// Interviewer: create a package
app.post('/bookings/packages', authenticate, async (req, res) => {
  const { title, description, totalSessions, sessionTypes, pricePerSession, bundlePrice } = req.body;
  if (!title || !totalSessions || !bundlePrice) {
    return res.status(400).json({ error: 'title, totalSessions, and bundlePrice are required.' });
  }
  const pkg = {
    packageId: uuidv4(),
    interviewerId: req.user.sub,
    title,
    description: description || '',
    totalSessions: Number(totalSessions),
    sessionTypes: sessionTypes || [],
    pricePerSession: Number(pricePerSession) || 0,
    bundlePrice: Number(bundlePrice),
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  await docClient.send(new PutCommand({ TableName: PACKAGES_TABLE, Item: pkg }));
  res.status(201).json(pkg);
});

// All active packages (candidates browse) — must be before /:packageId
app.get('/bookings/packages/all', authenticate, async (req, res) => {
  const { Items } = await docClient.send(new ScanCommand({
    TableName: PACKAGES_TABLE,
    FilterExpression: '#s = :active',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':active': 'active' },
  }));
  res.json(Items || []);
});

// Interviewer: their own packages — must be before /:packageId
app.get('/bookings/packages/mine', authenticate, async (req, res) => {
  const { Items } = await docClient.send(new ScanCommand({
    TableName: PACKAGES_TABLE,
    FilterExpression: 'interviewerId = :uid',
    ExpressionAttributeValues: { ':uid': req.user.sub },
  }));
  res.json(Items || []);
});

// Interviewer: toggle package active/inactive
app.patch('/bookings/packages/:packageId/toggle', authenticate, async (req, res) => {
  const { Item } = await docClient.send(new GetCommand({
    TableName: PACKAGES_TABLE,
    Key: { packageId: req.params.packageId },
  }));
  if (!Item) return res.status(404).json({ error: 'Package not found.' });
  if (Item.interviewerId !== req.user.sub) return res.status(403).json({ error: 'Forbidden' });

  const newStatus = Item.status === 'active' ? 'inactive' : 'active';
  await docClient.send(new UpdateCommand({
    TableName: PACKAGES_TABLE,
    Key: { packageId: req.params.packageId },
    UpdateExpression: 'SET #s = :status',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':status': newStatus },
  }));
  res.json({ packageId: req.params.packageId, status: newStatus });
});

// Candidate: purchase a package with card payment
app.post('/bookings/packages/:packageId/purchase', authenticate, async (req, res) => {
  const { cardNumber, cardExpiry, cardCvv, cardHolder } = req.body;

  const { Item: pkg } = await docClient.send(new GetCommand({
    TableName: PACKAGES_TABLE,
    Key: { packageId: req.params.packageId },
  }));
  if (!pkg) return res.status(404).json({ error: 'Package not found.' });
  if (pkg.status !== 'active') return res.status(400).json({ error: 'Package is not available.' });

  const cardError = validateCard({ cardNumber: cardNumber || '', cardExpiry: cardExpiry || '', cardCvv: cardCvv || '', cardHolder: cardHolder || '' });
  if (cardError) return res.status(400).json({ error: cardError });

  const purchase = {
    purchaseId: uuidv4(),
    candidateId: req.user.sub,
    packageId: pkg.packageId,
    interviewerId: pkg.interviewerId,
    packageTitle: pkg.title,
    totalSessions: pkg.totalSessions,
    sessionTypes: pkg.sessionTypes,
    usedSessions: 0,
    status: 'active',
    paymentStatus: 'paid',
    amountPaid: pkg.bundlePrice,
    cardLast4: cardNumber.replace(/\D/g, '').slice(-4),
    cardType: getCardType(cardNumber),
    purchasedAt: new Date().toISOString(),
  };

  await docClient.send(new PutCommand({ TableName: PURCHASES_TABLE, Item: purchase }));
  res.status(201).json(purchase);
});

// --- Purchase endpoints (must be before /bookings/:bookingId) ---

// Candidate: get their purchases
app.get('/bookings/purchases', authenticate, async (req, res) => {
  const { Items } = await docClient.send(new ScanCommand({
    TableName: PURCHASES_TABLE,
    FilterExpression: 'candidateId = :uid',
    ExpressionAttributeValues: { ':uid': req.user.sub },
  }));
  res.json(Items || []);
});

// Candidate: redeem a session from a purchase (creates booking without payment)
app.post('/bookings/purchases/:purchaseId/redeem', authenticate, async (req, res) => {
  const { slotId, sessionType } = req.body;
  if (!slotId || !sessionType) return res.status(400).json({ error: 'slotId and sessionType are required.' });

  const { Item: purchase } = await docClient.send(new GetCommand({
    TableName: PURCHASES_TABLE,
    Key: { purchaseId: req.params.purchaseId },
  }));
  if (!purchase) return res.status(404).json({ error: 'Purchase not found.' });
  if (purchase.candidateId !== req.user.sub) return res.status(403).json({ error: 'Forbidden' });
  if (purchase.status !== 'active') return res.status(400).json({ error: 'No sessions remaining in this package.' });
  if (purchase.usedSessions >= purchase.totalSessions) return res.status(400).json({ error: 'All sessions in this package have been used.' });

  const { Item: slot } = await docClient.send(new GetCommand({ TableName: SLOTS_TABLE, Key: { slotId } }));
  if (!slot) return res.status(404).json({ error: 'Slot not found.' });
  if (slot.interviewerId !== purchase.interviewerId) {
    return res.status(400).json({ error: 'This slot belongs to a different interviewer than your package.' });
  }

  try {
    await docClient.send(new UpdateCommand({
      TableName: SLOTS_TABLE,
      Key: { slotId },
      UpdateExpression: 'SET #s = :booked',
      ConditionExpression: '#s = :available',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':booked': 'booked', ':available': 'available' },
    }));
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return res.status(409).json({ error: 'This slot has already been booked. Please choose another.' });
    }
    throw err;
  }

  const bookingId = uuidv4();
  const booking = {
    bookingId,
    candidateId: req.user.sub,
    interviewerId: purchase.interviewerId,
    slotId,
    startTime: slot.startTime,
    endTime: slot.endTime,
    sessionType,
    status: 'confirmed',
    sessionEnabled: false,
    paymentStatus: 'package',
    packageId: purchase.packageId,
    purchaseId: req.params.purchaseId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await docClient.send(new PutCommand({ TableName: BOOKINGS_TABLE, Item: booking }));

  const newUsed = purchase.usedSessions + 1;
  const newPurchaseStatus = newUsed >= purchase.totalSessions ? 'completed' : 'active';
  await docClient.send(new UpdateCommand({
    TableName: PURCHASES_TABLE,
    Key: { purchaseId: req.params.purchaseId },
    UpdateExpression: 'SET usedSessions = :used, #s = :status',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':used': newUsed, ':status': newPurchaseStatus },
  }));

  await publishEvent('BOOKING_CONFIRMED', booking);
  res.status(201).json({ booking, remainingSessions: purchase.totalSessions - newUsed });
});

app.get('/bookings/:bookingId', authenticate, async (req, res) => {
  const { Item } = await docClient.send(new GetCommand({
    TableName: BOOKINGS_TABLE,
    Key: { bookingId: req.params.bookingId },
  }));
  if (!Item) return res.status(404).json({ error: 'Booking not found' });
  res.json(Item);
});

app.get('/bookings', authenticate, async (req, res) => {
  const userId = req.user.sub;
  const { role } = req.query;
  const filterKey = role === 'interviewer' ? 'interviewerId' : 'candidateId';
  const { Items } = await docClient.send(new ScanCommand({
    TableName: BOOKINGS_TABLE,
    FilterExpression: `${filterKey} = :uid`,
    ExpressionAttributeValues: { ':uid': userId },
  }));
  const bookings = Items || [];

  // Back-fill startTime/endTime from slot for older bookings that don't have them
  const needsSlot = bookings.filter(b => !b.startTime && b.slotId);
  if (needsSlot.length > 0) {
    await Promise.all(needsSlot.map(async (b) => {
      const { Item: slot } = await docClient.send(new GetCommand({
        TableName: SLOTS_TABLE,
        Key: { slotId: b.slotId },
      }));
      if (slot) {
        b.startTime = slot.startTime;
        b.endTime = slot.endTime;
      }
    }));
  }

  res.json(bookings);
});

// Interviewer: enable or disable session early
app.patch('/bookings/:bookingId/enable-session', authenticate, async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) is required.' });

  const { Item } = await docClient.send(new GetCommand({
    TableName: BOOKINGS_TABLE,
    Key: { bookingId: req.params.bookingId },
  }));
  if (!Item) return res.status(404).json({ error: 'Booking not found' });
  if (Item.interviewerId !== req.user.sub) return res.status(403).json({ error: 'Forbidden' });
  if (Item.status !== 'confirmed') return res.status(400).json({ error: 'Only confirmed bookings can be toggled.' });

  await docClient.send(new UpdateCommand({
    TableName: BOOKINGS_TABLE,
    Key: { bookingId: req.params.bookingId },
    UpdateExpression: 'SET sessionEnabled = :enabled, updatedAt = :updatedAt',
    ExpressionAttributeValues: { ':enabled': enabled, ':updatedAt': new Date().toISOString() },
  }));

  res.json({ bookingId: req.params.bookingId, sessionEnabled: enabled });
});

// Interviewer: cancel a confirmed booking
app.patch('/bookings/:bookingId/status', authenticate, async (req, res) => {
  const { status } = req.body;
  if (status !== 'cancelled') return res.status(400).json({ error: 'Only cancellation is supported.' });

  const { Item } = await docClient.send(new GetCommand({
    TableName: BOOKINGS_TABLE,
    Key: { bookingId: req.params.bookingId },
  }));
  if (!Item) return res.status(404).json({ error: 'Booking not found' });
  if (Item.interviewerId !== req.user.sub) return res.status(403).json({ error: 'Forbidden' });

  await docClient.send(new UpdateCommand({
    TableName: BOOKINGS_TABLE,
    Key: { bookingId: req.params.bookingId },
    UpdateExpression: 'SET #s = :status, updatedAt = :updatedAt',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':status': 'cancelled', ':updatedAt': new Date().toISOString() },
  }));

  await docClient.send(new UpdateCommand({
    TableName: SLOTS_TABLE,
    Key: { slotId: Item.slotId },
    UpdateExpression: 'SET #s = :status',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':status': 'available' },
  }));

  await publishEvent('BOOKING_CANCELLED', { bookingId: req.params.bookingId });
  res.json({ message: 'Booking cancelled' });
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'booking-service' }));

const { initTables } = require('./initTables');
initTables()
  .then(() => app.listen(PORT, () => console.log(`Booking service running on port ${PORT}`)))
  .catch(err => { console.error('Failed to init tables:', err); process.exit(1); });
