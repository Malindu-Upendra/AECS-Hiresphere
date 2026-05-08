require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { CognitoJwtVerifier } = require('aws-jwt-verify');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const PORT = process.env.PORT || 3006;

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  tokenUse: 'access',
  clientId: process.env.COGNITO_CLIENT_ID,
});

// Authenticate every socket connection via JWT
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Unauthorized'));
  try {
    socket.user = await verifier.verify(token);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  console.log(`[session] connected: ${socket.user.sub}`);

  socket.on('join-room', (bookingId) => {
    socket.join(bookingId);
    socket.currentRoom = bookingId;

    const room = io.sockets.adapter.rooms.get(bookingId);
    const count = room ? room.size : 0;

    // Tell the joining socket how many people are now in the room
    socket.emit('room-joined', { count });

    // Notify the other participant that someone joined
    socket.to(bookingId).emit('peer-joined');

    console.log(`[session] ${socket.user.sub} joined room ${bookingId} (${count} total)`);
  });

  // Relay WebRTC signaling messages to the other peer in the room
  socket.on('offer', ({ roomId, offer }) => {
    socket.to(roomId).emit('offer', { offer });
  });

  socket.on('answer', ({ roomId, answer }) => {
    socket.to(roomId).emit('answer', { answer });
  });

  socket.on('ice-candidate', ({ roomId, candidate }) => {
    socket.to(roomId).emit('ice-candidate', { candidate });
  });

  socket.on('leave-room', () => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('peer-left');
      socket.leave(socket.currentRoom);
      console.log(`[session] ${socket.user.sub} left room ${socket.currentRoom}`);
      socket.currentRoom = null;
    }
  });

  socket.on('disconnect', () => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('peer-left');
      console.log(`[session] ${socket.user.sub} disconnected from room ${socket.currentRoom}`);
    }
  });
});

// REST: check how many participants are in a session room
app.use(express.json());

async function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    await verifier.verify(auth.split(' ')[1]);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

app.get('/sessions/:bookingId/status', authenticate, (req, res) => {
  const room = io.sockets.adapter.rooms.get(req.params.bookingId);
  const participants = room ? room.size : 0;
  res.json({ bookingId: req.params.bookingId, participants });
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'session-service' }));

server.listen(PORT, () => console.log(`Session service running on port ${PORT}`));
