import { prisma } from '../../shared/lib/prisma';
import redis from '../../shared/lib/redis';
import { getIO } from '../../websocket/socket';
import {
  findCliqueForUser,
  calculateGroupCenter,
  calculateGeohash,
  acquireCreationLock,
  releaseCreationLock,
} from './group.engine';
import type {
  GroupNearbyResponse,
  GroupCreatedPayload,
} from './group.types';

const USER_GROUPS_PREFIX = 'user:groups';
const GROUP_MEMBERS_PREFIX = 'group:members';

/**
 * Haversine distance in meters between two lat/lng points.
 */
function getDistanceFromLatLngInM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Called when a user connects to location sharing.
 * If the user has no group, tries to find a clique and auto-create a group.
 */
export async function onUserConnected(userId: number): Promise<GroupCreatedPayload | null> {
  // 1. Check if user already has a group
  //    Defensive: clean up orphaned flags if the group was deleted in PostgreSQL
  const existingGroups = await redis.smembers(`${USER_GROUPS_PREFIX}:${userId}`);
  if (existingGroups.length > 0) {
    let hasValidGroup = false;
    for (const chatIdStr of existingGroups) {
      const chatId = parseInt(chatIdStr, 10);
      const groupExists = await prisma.groupChat.findUnique({
        where: { chatId },
        select: { id: true },
      });
      if (groupExists) {
        hasValidGroup = true;
      } else {
        // Orphaned flag: clean up Redis
        await redis.srem(`${USER_GROUPS_PREFIX}:${userId}`, String(chatId));
        await redis.srem(`${GROUP_MEMBERS_PREFIX}:${chatId}`, String(userId));

        // Clean up orphaned chat from Prisma if no members remain in Redis
        const remainingRedisMembers = await redis.smembers(`${GROUP_MEMBERS_PREFIX}:${chatId}`);
        if (remainingRedisMembers.length === 0) {
          try {
            await prisma.chat.delete({ where: { id: chatId } });
            console.log(`[onUserConnected] Cleaned up orphaned chat ${chatId}`);
          } catch (err) {
            console.error(`[onUserConnected] Failed to clean up orphaned chat ${chatId}:`, err);
          }
        }
      }
    }
    if (hasValidGroup) {
      return null;
    }
  }

  // 2. Find a clique of mutually visible users without groups
  const clique = await findCliqueForUser(userId);
  if (!clique || clique.length < 3) {
    return null;
  }

  // 3. Get locations of all clique members for center calculation
  const locations: Array<{ latitude: number; longitude: number }> = [];
  for (const uid of clique) {
    const session = await redis.hgetall(`location:session:${uid}`);
    const lat = parseFloat(session.lat);
    const lng = parseFloat(session.lng);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      locations.push({ latitude: lat, longitude: lng });
    }
  }

  if (locations.length < 3) {
    return null;
  }

  // 4. Calculate center and geohash
  const center = calculateGroupCenter(locations);
  const geohash = calculateGeohash(center.lat, center.lng);

  // 5. Acquire distributed lock
  const lockAcquired = await acquireCreationLock(geohash);
  if (!lockAcquired) {
    return null;
  }

  try {
    // 6. Double-check: verify no clique member joined a group while waiting
    for (const uid of clique) {
      const hasGroup = await redis.scard(`${USER_GROUPS_PREFIX}:${uid}`);
      if (hasGroup > 0) {
        return null;
      }
    }

    // 7. Create the group
    return await createGroupFromClique(clique, center.lat, center.lng, userId);
  } finally {
    await releaseCreationLock(geohash);
  }
}

/**
 * Create a group chat from a verified clique.
 * Uses atomic Prisma transaction.
 */
export async function createGroupFromClique(
  userIds: number[],
  centerLat: number,
  centerLng: number,
  createdById: number
): Promise<GroupCreatedPayload> {
  const result = await prisma.$transaction(async (tx) => {
    // Create the chat
    const chat = await tx.chat.create({ data: {} });

    // Create the group profile (no user associated)
    const profile = await tx.profile.create({
      data: {
        userId: null,
        name: 'Group chat',
        message: '',
        imageUrl: '/defaults/default-group.png',
      },
    });

    // Create the group chat
    const groupChat = await tx.groupChat.create({
      data: {
        chatId: chat.id,
        profileId: profile.id,
        createdById,
        latitude: centerLat,
        longitude: centerLng,
        radius: 2000,
      },
    });

    // Create chat memberships for all clique members
    for (const uid of userIds) {
      await tx.chatMember.create({
        data: {
          userId: uid,
          chatId: chat.id,
          role: 'MEMBER',
        },
      });
    }

    return {
      chatId: chat.id,
      name: profile.name,
      latitude: groupChat.latitude,
      longitude: groupChat.longitude,
      imageUrl: profile.imageUrl,
      members: userIds,
    };
  });

  // Update Redis flags after successful transaction
  for (const uid of userIds) {
    await redis.sadd(`${USER_GROUPS_PREFIX}:${uid}`, String(result.chatId));
    await redis.sadd(`${GROUP_MEMBERS_PREFIX}:${result.chatId}`, String(uid));
  }

  // Notify all clique members via socket
  try {
    const io = getIO();
    for (const uid of userIds) {
      io.to(`user:${uid}`).emit('group:created', result);
    }
  } catch (err) {
    console.error('[createGroupFromClique] Socket notification failed:', err);
  }

  return result;
}

/**
 * Called when a user disconnects from location sharing.
 * Removes the user from all groups. If any group drops below 3 members, deletes it.
 */
export async function onUserDisconnected(userId: number): Promise<void> {
  // 1. Get all groups this user belongs to
  const groupIds = await redis.smembers(`${USER_GROUPS_PREFIX}:${userId}`);

  // 2. Remove from each group
  for (const chatIdStr of groupIds) {
    const chatId = parseInt(chatIdStr, 10);

    // Remove ChatMember from Prisma (ignore if already gone)
    try {
      await prisma.chatMember.deleteMany({
        where: { userId, chatId },
      });
    } catch (err) {
      console.error(`[onUserDisconnected] Failed to delete chatMember for user ${userId} in chat ${chatId}:`, err);
    }

    // Remove from Redis group members set
    await redis.srem(`${GROUP_MEMBERS_PREFIX}:${chatId}`, String(userId));

    // Check remaining member count
    const remainingCount = await redis.scard(`${GROUP_MEMBERS_PREFIX}:${chatId}`);

    if (remainingCount <= 2) {
      await deleteGroup(chatId);
    }
  }

  // 3. Clear user's groups flag
  await redis.del(`${USER_GROUPS_PREFIX}:${userId}`);
}

/**
 * Hard delete a group and all its associated data.
 * Cascade from Chat deletes: GroupChat, Profile, ChatMembers, Messages.
 */
export async function deleteGroup(chatId: number): Promise<void> {
  const membersKey = `${GROUP_MEMBERS_PREFIX}:${chatId}`;
  const remainingMembers = await redis.smembers(membersKey);

  // Notify members before deleting — emit to both the chat room AND each user's personal room
  // so that users on the map (who are not in the chat room) also receive the event
  try {
    const io = getIO();
    io.to(`chat:${chatId}`).emit('group:deleted', { chatId, reason: 'underflow' });
    for (const uid of remainingMembers) {
      io.to(`user:${uid}`).emit('group:deleted', { chatId, reason: 'underflow' });
    }
  } catch (err) {
    console.error(`[deleteGroup] Socket notification failed for ${chatId}:`, err);
  }

  // Delete from Prisma FIRST (atomic source of truth)
  try {
    await prisma.chat.delete({
      where: { id: chatId },
    });
  } catch (error) {
    console.error(`[deleteGroup] Failed to delete group ${chatId} from Prisma:`, error);
    // If Prisma fails, do NOT clean Redis so we can retry later
    return;
  }

  // Only clean Redis after Prisma succeeds
  for (const uid of remainingMembers) {
    await redis.srem(`${USER_GROUPS_PREFIX}:${uid}`, String(chatId));
  }
  await redis.del(membersKey);
}

/**
 * Find nearby groups from a given location.
 * Uses a bounding-box filter in PostgreSQL first, then exact Haversine distance.
 */
export async function getNearbyGroups(
  lat: number,
  lng: number,
  radius: number,
  userId: number
): Promise<GroupNearbyResponse[]> {
  // 1. Approximate bounding box (1 degree lat ≈ 111km)
  const latDelta = radius / 111000;
  const lngDelta = radius / (111000 * Math.cos((lat * Math.PI) / 180));

  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLng = lng - lngDelta;
  const maxLng = lng + lngDelta;

  // 2. Fetch candidate groups within bounding box — only select needed fields
  const candidateGroups = await prisma.groupChat.findMany({
    where: {
      latitude: { gte: minLat, lte: maxLat },
      longitude: { gte: minLng, lte: maxLng },
    },
    select: {
      chatId: true,
      latitude: true,
      longitude: true,
      chat: {
        select: {
          _count: { select: { members: true } },
        },
      },
      profile: {
        select: {
          name: true,
          imageUrl: true,
        },
      },
    },
    take: 50,
  });

  // 3. Filter by exact distance and collect nearby chatIds
  const nearbyCandidates: Array<{
    group: typeof candidateGroups[0];
    distance: number;
  }> = [];

  for (const group of candidateGroups) {
    const distance = getDistanceFromLatLngInM(
      lat,
      lng,
      group.latitude,
      group.longitude
    );
    if (distance <= radius) {
      nearbyCandidates.push({ group, distance });
    }
  }

  // 4. Batch check unread for all nearby groups (avoid N+1)
  const nearbyChatIds = nearbyCandidates.map((c) => c.group.chatId);
  const unreadMap = await hasUnreadInGroups(nearbyChatIds, userId);

  return nearbyCandidates.map(({ group }) => ({
    chatId: group.chatId,
    name: group.profile.name,
    latitude: group.latitude,
    longitude: group.longitude,
    imageUrl: group.profile.imageUrl,
    membersCount: group.chat._count.members,
    hasUnread: unreadMap.get(group.chatId) || false,
  }));
}

/**
 * Check if a user has unread messages in a group.
 */
async function hasUnreadInGroup(chatId: number, userId: number): Promise<boolean> {
  const unread = await prisma.message.findFirst({
    where: {
      chatId,
      senderId: { not: userId },
      seen: false,
    },
    select: { id: true },
  });

  return !!unread;
}

/**
 * Batch check unread status for multiple groups.
 * Returns a Map where key = chatId, value = hasUnread boolean.
 */
async function hasUnreadInGroups(
  chatIds: number[],
  userId: number
): Promise<Map<number, boolean>> {
  if (chatIds.length === 0) {
    return new Map();
  }

  const unreadMessages = await prisma.message.findMany({
    where: {
      chatId: { in: chatIds },
      senderId: { not: userId },
      seen: false,
    },
    select: { chatId: true },
    distinct: ['chatId'],
  });

  const unreadChatIds = new Set(unreadMessages.map((m) => m.chatId));
  return new Map(chatIds.map((id) => [id, unreadChatIds.has(id)]));
}

/**
 * Allow a user to manually join a group if they are within the group's radius.
 */
export async function joinGroup(chatId: number, userId: number): Promise<void> {
  // 1. Verify user has an active location session
  const session = await redis.hgetall(`location:session:${userId}`);
  if (!session || Object.keys(session).length === 0) {
    throw new Error('User does not have an active location session');
  }

  const userLat = parseFloat(session.lat);
  const userLng = parseFloat(session.lng);

  if (Number.isNaN(userLat) || Number.isNaN(userLng)) {
    throw new Error('Invalid user location');
  }

  // 2. Get the group
  const group = await prisma.groupChat.findUnique({
    where: { chatId },
  });

  if (!group) {
    throw new Error('Group not found');
  }

  // 3. Check if user is within the group's radius
  const distance = getDistanceFromLatLngInM(
    userLat,
    userLng,
    group.latitude,
    group.longitude
  );

  if (distance > group.radius) {
    throw new Error('User is too far from the group');
  }

  // 4. Check if already a member
  const existing = await prisma.chatMember.findUnique({
    where: {
      userId_chatId: {
        userId,
        chatId,
      },
    },
  });

  if (existing) {
    // Already a member, just ensure Redis is in sync
    await redis.sadd(`${USER_GROUPS_PREFIX}:${userId}`, String(chatId));
    await redis.sadd(`${GROUP_MEMBERS_PREFIX}:${chatId}`, String(userId));
    return;
  }

  // 5. Create membership
  await prisma.chatMember.create({
    data: {
      userId,
      chatId,
      role: 'MEMBER',
    },
  });

  // 6. Update Redis
  await redis.sadd(`${USER_GROUPS_PREFIX}:${userId}`, String(chatId));
  await redis.sadd(`${GROUP_MEMBERS_PREFIX}:${chatId}`, String(userId));

  // 7. Notify all members in the chat
  try {
    const io = getIO();
    io.to(`chat:${chatId}`).emit('group:joined', { chatId, userId });
  } catch (err) {
    console.error('[joinGroup] Socket notification failed:', err);
  }
}
