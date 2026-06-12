import { Server } from 'socket.io';
import { z } from 'zod';
import redis from '../../shared/lib/redis';
import { checkWsRateLimit } from '../../shared/middleware/rateLimit';
import { updateUserLocation, findVisibleUsersFor, findConnectedFriendsFor } from './location.engine';
import { disconnectUserLocation } from './location.service';
import { prisma } from '../../shared/lib/prisma';
import { hasUnreadFromMultipleUsers } from '../chat/chat.service';
import { onUserConnected, getNearbyGroups } from '../group/group.service';
import type { GroupNearbyResponse } from '../group/group.types';

const SESSION_KEY_PREFIX = 'location:session';

const locationUpdateSchema = z.object({
  latitude: z.number().min(-90, 'Latitude must be >= -90').max(90, 'Latitude must be <= 90'),
  longitude: z.number().min(-180, 'Longitude must be >= -180').max(180, 'Longitude must be <= 180'),
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

/** Batch fetch all profiles for a list of userIds in a single query. */
async function getProfilesForUsers(
  userIds: number[]
): Promise<Map<number, { id: number; userId: number | null; name: string; message: string; imageUrl: string | null }>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const profiles = await prisma.profile.findMany({
    where: { userId: { in: userIds } },
  });
  return new Map(profiles.map((p) => [p.userId!, p]));
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

        // Enrich with Prisma Profile data (batch queries to avoid N+1)
        let enrichedUsers;
        try {
          const userIds = visibleUsers.map((u) => parseInt(u.userId, 10));
          const [profilesMap, unreadMap] = await Promise.all([
            getProfilesForUsers(userIds),
            hasUnreadFromMultipleUsers(userId, userIds),
          ]);

          enrichedUsers = visibleUsers.map((user) => ({
            userId: parseInt(user.userId, 10),
            latitude: user.latitude,
            longitude: user.longitude,
            distance: user.distance,
            profile: profilesMap.get(parseInt(user.userId, 10)) || null,
            hasUnread: unreadMap.get(parseInt(user.userId, 10)) || false,
          }));
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

        // Get connected friends for the user (batch queries to avoid N+1)
        let enrichedFriends: EnrichedFriend[];
        try {
          const connectedFriends = await findConnectedFriendsFor(userId);
          const friendIds = connectedFriends.map((f) => f.userId);

          const [friendProfiles, friendUnread] = await Promise.all([
            getProfilesForUsers(friendIds),
            hasUnreadFromMultipleUsers(userId, friendIds),
          ]);

          enrichedFriends = connectedFriends.map((friend) => ({
            userId: friend.userId,
            latitude: friend.latitude,
            longitude: friend.longitude,
            profile: friendProfiles.get(friend.userId) || null,
            hasUnread: friendUnread.get(friend.userId) || false,
          }));
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
        // Rate limiting
        if (!(await checkWsRateLimit('locationUpdate', userId))) {
          socket.emit('location:error', { error: 'Rate limit exceeded' });
          return;
        }

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
