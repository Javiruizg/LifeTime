import 'dotenv/config';
import http from 'http';
import app from './app';
import { setupSocket } from './websocket/socket';
import { registerLocationSocketHandlers } from './features/location/location.socket';
import { registerChatSocketHandlers } from './features/chat/chat.socket';
import { registerGroupSocketHandlers } from './features/group/group.socket';
import { registerFriendsSocketHandlers } from './features/friends/friends.socket';
import { prisma } from './shared/lib/prisma';
import redis from './shared/lib/redis';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

async function main() {

  await redis.connect();

  try {
    await prisma.$connect();
    console.log('✅ PostgreSQL connected');
  } catch (err) {
    // Don't crash the whole process in local dev when DB is missing or creds are wrong.
    // This repo often runs in dev without a local Postgres instance; keep the server
    // running for tasks that don't require DB (health, static uploads, local dev).
    console.error('⚠️ Could not connect to PostgreSQL:', (err as Error).message);
    console.error('⚠️ Continuing without database connection — set DATABASE_URL and run migrations to enable DB features.');
  }

  // Create HTTP server and setup WebSocket
  const httpServer = http.createServer(app);
  const io = setupSocket(httpServer);
  registerLocationSocketHandlers(io);
  registerChatSocketHandlers(io);
  registerGroupSocketHandlers(io);
  registerFriendsSocketHandlers(io);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log(`Health: http://0.0.0.0:${PORT}/health`);
  });
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
