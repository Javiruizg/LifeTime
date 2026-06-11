import { Server } from 'socket.io';
import { getIO } from '../../websocket/socket';
import { prisma } from '../../shared/lib/prisma';
import type {
  FriendStatusChangedPayload,
  FriendRequestReceivedPayload,
  FriendRequestAcceptedPayload,
  FriendRemovedPayload,
} from './friends.types';

export function registerFriendsSocketHandlers(_io: Server): void {
  // No connection-level handlers needed; all friend events are emitted
  // directly from the service layer via helper functions below.
}

/**
 * Emit a friend request received event to a specific user.
 */
export function emitFriendRequestReceived(
  receiverId: number,
  payload: FriendRequestReceivedPayload
): void {
  try {
    const io = getIO();
    io.to(`user:${receiverId}`).emit('friend:request_received', payload);
  } catch {
    // Socket.IO not initialized (e.g., in tests)
  }
}

/**
 * Emit a friend request accepted event to a specific user.
 */
export function emitFriendRequestAccepted(
  senderId: number,
  payload: FriendRequestAcceptedPayload
): void {
  try {
    const io = getIO();
    io.to(`user:${senderId}`).emit('friend:request_accepted', payload);
  } catch {
    // Socket.IO not initialized (e.g., in tests)
  }
}

/**
 * Emit a friend removed event to a specific user.
 */
export function emitFriendRemoved(userId: number, payload: FriendRemovedPayload): void {
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit('friend:removed', payload);
  } catch {
    // Socket.IO not initialized (e.g., in tests)
  }
}

/**
 * Emit a friend status changed event to all friends of a user.
 */
export async function emitFriendStatusChanged(userId: number, isOnline: boolean): Promise<void> {
  try {
    const io = getIO();
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ userIdA: userId }, { userIdB: userId }],
      },
      select: { userIdA: true, userIdB: true },
    });
    for (const f of friendships) {
      const friendId = f.userIdA === userId ? f.userIdB : f.userIdA;
      const payload: FriendStatusChangedPayload = { friendId: userId, isOnline };
      io.to(`user:${friendId}`).emit('friend:status_changed', payload);
    }
  } catch {
    // Socket.IO not initialized or DB error
  }
}
