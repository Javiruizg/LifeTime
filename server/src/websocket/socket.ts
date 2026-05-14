import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { prisma } from '../shared/lib/prisma';

export function setupSocket(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*', // TODO: restringir en producción
      methods: ['GET', 'POST'],
    },
  });

  // Middleware de autenticación WebSocket
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      return next(new Error('Unauthorized: missing device token'));
    }

    try {
      const user = await prisma.user.findUnique({
        where: { deviceToken: token },
        include: { profile: true },
      });

      if (!user) {
        return next(new Error('Unauthorized: invalid device token'));
      }

      // Añadir datos del usuario al socket
      (socket as any).userId = user.id;
      (socket as any).userProfile = user.profile;

      next();
    } catch (err) {
      next(new Error('Internal server error'));
    }
  });

  io.on('connection', (socket) => {
    const userId = (socket as any).userId as number;
    console.log(`🔌 User ${userId} connected via WebSocket`);

    // Unir al room personal del usuario (para mensajes privados)
    socket.join(`user:${userId}`);

    socket.on('disconnect', () => {
      console.log(`🔌 User ${userId} disconnected`);
    });

    // TODO: eventos del mapa, chat, etc. — se implementarán en sus features
  });

  return io;
}
