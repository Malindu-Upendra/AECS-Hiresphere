require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { CognitoJwtVerifier } = require('aws-jwt-verify');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  tokenUse: 'access',
  clientId: process.env.COGNITO_CLIENT_ID,
});

// Verify Cognito token and return decoded claims
app.post('/auth/verify', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  try {
    const payload = await verifier.verify(token);
    res.json({ valid: true, payload });
  } catch (err) {
    res.status(401).json({ valid: false, error: 'Invalid or expired token' });
  }
});

// Internal middleware helper — used by API Gateway or other services
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth-service' }));

app.listen(PORT, () => console.log(`Auth service running on port ${PORT}`));
