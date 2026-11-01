import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { createApp, createSocketAuthenticator } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
await mongoose.connect(config.mongoUri);

const httpServer = createServer(createApp(config));
const io = new Server(httpServer, {
  cors: {
    origin: config.allowedOrigins
  }
});

io.use(createSocketAuthenticator(config));
io.on('connection', (socket) => {
  socket.join(`user:${socket.data.userId}`);
});

httpServer.listen(config.port, () => {
  console.log(`ChatApp API listening on port ${config.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  await new Promise((resolve) => io.close(resolve));
  await mongoose.disconnect();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
