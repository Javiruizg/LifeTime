import { Server } from 'socket.io';
import { z } from 'zod';
import redis from '../../shared/lib/redis';
import { updateUserLocation, findVisibleUsersFor } from './location.engine';
import { prisma } from '../../shared/lib/prisma';

const SESSION_KEY_PREFIX = 'location:session';

const locationUpdateSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

export function registerLocationSocketHandlers(io: Server): void {
  //This is executed everytime a client connects to the WebSocket server. We set up event handlers for location updates and disconnections here.
  io.on('connection', async (socket) => {
    const userId = socket.data.userId as number;
    const sessionKey = `${SESSION_KEY_PREFIX}:${userId}`;

    // Check if active location session exists.
    // If not, the socket stays connected but does nothing (user is browsing).
    const sessionExists = await redis.exists(sessionKey);
    if (!sessionExists) {
      return;
    }

    // Session exists: start periodic visibility updates (~7s)
    const intervalId = setInterval(async () => {
      try {
        // Re-read session. If gone (TTL expired):
        const stillExists = await redis.exists(sessionKey);
        if (!stillExists) {
          socket.emit('location:session_expired');
          clearInterval(intervalId);
          return;
        }

        const visibleUsers = await findVisibleUsersFor(userId);

        // Enrich with Prisma Profile data
        let enrichedUsers;
        try {
          enrichedUsers = await Promise.all(
            visibleUsers.map(async (user) => {
              const profile = await prisma.profile.findUnique({
                where: { userId: parseInt(user.userId, 10) },
              });
              return {
                userId: parseInt(user.userId, 10),
                latitude: user.latitude,
                longitude: user.longitude,
                distance: user.distance,
                profile: profile || null,
              };
            })
          );
        } catch {
          // If DB is unavailable, return raw visible users without profile enrichment
          enrichedUsers = visibleUsers.map((user) => ({
            userId: parseInt(user.userId, 10),
            latitude: user.latitude,
            longitude: user.longitude,
            distance: user.distance,
            profile: null,
          }));
        }

        socket.emit('location:users', enrichedUsers);
      } catch (error) {
        console.error('Location socket interval error:', error);
      }
    }, 7000);

    // Handle incoming location updates from client
    socket.on('location:update', async (payload) => {
      try {
        const parsed = locationUpdateSchema.safeParse(payload);
        if (!parsed.success) {
          console.warn('Invalid location:update payload:', parsed.error);
          return;
        }

        const exists = await redis.exists(sessionKey);
        if (!exists) {
          // Silently ignored if session expired
          return;
        }

        await updateUserLocation(userId, parsed.data.latitude, parsed.data.longitude);
      } catch (error) {
        console.error('Location update error:', error);
      }
    });

    // Clean up interval on disconnect.
    // Do NOT remove from geo set immediately (force-close resilience requirement).
    // Lazy cleanup handles it.
    socket.on('disconnect', () => {
      clearInterval(intervalId);
    });
  });
}
