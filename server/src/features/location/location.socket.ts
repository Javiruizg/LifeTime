import { Server } from 'socket.io';
import { z } from 'zod';
import redis from '../../shared/lib/redis';
import { updateUserLocation, findVisibleUsersFor, findConnectedFriendsFor } from './location.engine';
import { disconnectUserLocation } from './location.service';
import { prisma } from '../../shared/lib/prisma';
import { hasUnreadFromUser } from '../chat/chat.service';
import { onUserConnected, getNearbyGroups } from '../group/group.service';
import type { GroupNearbyResponse } from '../group/group.types';

const SESSION_KEY_PREFIX = 'location:session';

const locationUpdateSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

interface EnrichedFriend {
  userId: number;
  latitude: number;
  longitude: number;
  profile: {
    id: number;
    userId: number | null;
    name: string;
    message: string;
    imageUrl: string | null;
  } | null;
  hasUnread: boolean;
}

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
          // Ensure group cleanup happens even when TTL expires (not just on explicit disconnect)
          await disconnectUserLocation(userId);
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
              const hasUnread = await hasUnreadFromUser(
                userId,
                parseInt(user.userId, 10)
              );
              return {
                userId: parseInt(user.userId, 10),
                latitude: user.latitude,
                longitude: user.longitude,
                distance: user.distance,
                profile: profile || null,
                hasUnread,
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
            hasUnread: false,
          }));
        }

        // Get connected friends for the user
        let enrichedFriends: EnrichedFriend[];
        try {
          const connectedFriends = await findConnectedFriendsFor(userId);
          enrichedFriends = await Promise.all(
            connectedFriends.map(async (friend) => {
              const profile = await prisma.profile.findUnique({
                where: { userId: friend.userId },
              });
              const hasUnread = await hasUnreadFromUser(userId, friend.userId);
              return {
                userId: friend.userId,
                latitude: friend.latitude,
                longitude: friend.longitude,
                profile: profile || null,
                hasUnread,
              };
            })
          );
        } catch {
          enrichedFriends = [];
        }

        // Get nearby groups for the user
        let nearbyGroups: GroupNearbyResponse[] = [];
        try {
          const session = await redis.hgetall(sessionKey);
          const lat = parseFloat(session.lat);
          const lng = parseFloat(session.lng);
          if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
            nearbyGroups = await getNearbyGroups(lat, lng, 2000, userId);
          }
        } catch {
          nearbyGroups = [];
        }

        socket.emit('location:users', { users: enrichedUsers, friends: enrichedFriends });
        socket.emit('location:groups', nearbyGroups);
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

        // Check if this is the first location update (no previous lat/lng)
        const sessionBefore = await redis.hgetall(sessionKey);
        const hadLocation = sessionBefore.lat && sessionBefore.lng;

        await updateUserLocation(userId, parsed.data.latitude, parsed.data.longitude);

        // If first location update, try to auto-create or join a group
        if (!hadLocation) {
          try {
            await onUserConnected(userId);
          } catch (error) {
            console.error('Group auto-creation error:', error);
          }
        }
      } catch (error) {
        console.error('Location update error:', error);
      }
    });

    // Clean up interval on disconnect.
    // Immediate cleanup for group memberships is required so that groups
    // drop members correctly and auto-delete when under 3.
    socket.on('disconnect', () => {
      clearInterval(intervalId);
      disconnectUserLocation(userId).catch((err) => {
        console.error('Error during disconnect cleanup:', err);
      });
    });
  });
}
