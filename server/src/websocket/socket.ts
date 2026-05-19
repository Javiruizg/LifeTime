import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { verifyAccessToken, TokenError } from '../shared/lib/jwt';
import type { SocketData } from '../shared/types/auth';

const SOCKET_AUTH_ERROR = 'Unauthorized: missing token';

export function setupSocket(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer<SocketData>(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      return next(new Error(SOCKET_AUTH_ERROR));
    }

    try {
      const decoded = verifyAccessToken(token);
      socket.data.userId = decoded.userId;
      next();
    } catch (err) {
      if (err instanceof TokenError && err.code === 'TOKEN_EXPIRED') {
        return next(new Error('Unauthorized: token expired'));
      }
      if (err instanceof TokenError && err.code === 'INVALID_TYPE') {
        return next(new Error('Unauthorized: invalid token type'));
      }
      next(new Error('Unauthorized: invalid or malformed token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User ${socket.data.userId} connected via WebSocket`);
    socket.join(`user:${socket.data.userId}`);

    socket.on('disconnect', () => {
      console.log(`User ${socket.data.userId} disconnected`);
    });
  });

  return io;
}