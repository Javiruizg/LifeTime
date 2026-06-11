import { prisma } from '../../shared/lib/prisma';
import redis from '../../shared/lib/redis';
import {
  emitFriendRequestReceived,
  emitFriendRequestAccepted,
  emitFriendRemoved,
} from './friends.socket';
import type {
  Friend,
  FriendRequestWithProfile,
  FriendStatusResponse,
} from './friends.types';

const SESSION_KEY_PREFIX = 'location:session';

export async function sendFriendRequest(senderId: number, receiverId: number): Promise<void> {
  if (senderId === receiverId) {
    throw new Error('Cannot send friend request to yourself');
  }

  const userIdA = Math.min(senderId, receiverId);
  const userIdB = Math.max(senderId, receiverId);

  const existingFriendship = await prisma.friendship.findUnique({
    where: { userIdA_userIdB: { userIdA, userIdB } },
  });
  if (existingFriendship) {
    throw new Error('Already friends');
  }

  const existingRequest = await prisma.friendRequest.findUnique({
    where: { senderId_receiverId: { senderId, receiverId } },
  });
  if (existingRequest) {
    if (existingRequest.status === 'PENDING') {
      throw new Error('Friend request already sent');
    }
    if (existingRequest.status === 'REJECTED') {
      throw new Error('Friend request was rejected. Cannot send again.');
    }
    throw new Error('Friend request already handled');
  }

  const reverseRequest = await prisma.friendRequest.findUnique({
    where: { senderId_receiverId: { senderId: receiverId, receiverId: senderId } },
  });
  if (reverseRequest) {
    if (reverseRequest.status === 'PENDING') {
      await prisma.$transaction(async (tx) => {
        await tx.friendship.create({
          data: { userIdA, userIdB },
        });
        await tx.friendRequest.delete({
          where: { id: reverseRequest.id },
        });
      });

      const senderProfile = await prisma.profile.findUnique({
        where: { userId: senderId },
      });
      emitFriendRequestAccepted(receiverId, {
        friendId: senderId,
        friendName: senderProfile?.name ?? 'Unnamed',
        friendImageUrl: senderProfile?.imageUrl ?? null,
      });
      return;
    }
    if (reverseRequest.status === 'REJECTED') {
      await prisma.$transaction(async (tx) => {
        await tx.friendRequest.delete({
          where: { id: reverseRequest.id },
        });
        const newRequest = await tx.friendRequest.create({
          data: {
            senderId,
            receiverId,
            status: 'PENDING',
          },
        });

        const senderProfile = await prisma.profile.findUnique({
          where: { userId: senderId },
        });
        emitFriendRequestReceived(receiverId, {
          requestId: newRequest.id,
          senderId,
          senderName: senderProfile?.name ?? 'Unnamed',
          senderImageUrl: senderProfile?.imageUrl ?? null,
        });
      });
      return;
    }
  }

  const request = await prisma.friendRequest.create({
    data: {
      senderId,
      receiverId,
      status: 'PENDING',
    },
  });

  const senderProfile = await prisma.profile.findUnique({
    where: { userId: senderId },
  });
  emitFriendRequestReceived(receiverId, {
    requestId: request.id,
    senderId,
    senderName: senderProfile?.name ?? 'Unnamed',
    senderImageUrl: senderProfile?.imageUrl ?? null,
  });
}

export async function cancelFriendRequest(senderId: number, receiverId: number): Promise<void> {
  const request = await prisma.friendRequest.findUnique({
    where: { senderId_receiverId: { senderId, receiverId } },
  });
  if (!request || request.status !== 'PENDING') {
    throw new Error('No pending friend request found');
  }
  await prisma.friendRequest.delete({
    where: { id: request.id },
  });
}

export async function acceptFriendRequest(receiverId: number, requestId: number): Promise<void> {
  const request = await prisma.friendRequest.findFirst({
    where: { id: requestId, receiverId, status: 'PENDING' },
  });
  if (!request) {
    throw new Error('Friend request not found');
  }

  const userIdA = Math.min(request.senderId, request.receiverId);
  const userIdB = Math.max(request.senderId, request.receiverId);

  await prisma.$transaction(async (tx) => {
    await tx.friendship.create({
      data: { userIdA, userIdB },
    });
    await tx.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId: request.senderId, receiverId: request.receiverId },
          { senderId: request.receiverId, receiverId: request.senderId },
        ],
      },
    });
  });

  const receiverProfile = await prisma.profile.findUnique({
    where: { userId: receiverId },
  });
  emitFriendRequestAccepted(request.senderId, {
    friendId: receiverId,
    friendName: receiverProfile?.name ?? 'Unnamed',
    friendImageUrl: receiverProfile?.imageUrl ?? null,
  });
}

export async function rejectFriendRequest(receiverId: number, requestId: number): Promise<void> {
  const request = await prisma.friendRequest.findFirst({
    where: { id: requestId, receiverId, status: 'PENDING' },
  });
  if (!request) {
    throw new Error('Friend request not found');
  }

  await prisma.friendRequest.update({
    where: { id: request.id },
    data: { status: 'REJECTED' },
  });
}

export async function removeFriendship(userId: number, friendId: number): Promise<void> {
  const userIdA = Math.min(userId, friendId);
  const userIdB = Math.max(userId, friendId);

  await prisma.$transaction(async (tx) => {
    await tx.friendship.deleteMany({
      where: { userIdA, userIdB },
    });
    await tx.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
      },
    });
  });

  emitFriendRemoved(friendId, { friendId: userId });
  emitFriendRemoved(userId, { friendId });
}

export async function getFriends(userId: number): Promise<Friend[]> {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [{ userIdA: userId }, { userIdB: userId }],
    },
    include: {
      userA: { include: { profile: true } },
      userB: { include: { profile: true } },
    },
  });

  const friends: Friend[] = [];
  for (const f of friendships) {
    const friendUser = f.userIdA === userId ? f.userB : f.userA;
    const sessionKey = `${SESSION_KEY_PREFIX}:${friendUser.id}`;
    const isOnline = (await redis.exists(sessionKey)) === 1;
    friends.push({
      id: f.id,
      userId: friendUser.id,
      profile: {
        id: friendUser.profile?.id ?? 0,
        name: friendUser.profile?.name ?? 'Unnamed',
        imageUrl: friendUser.profile?.imageUrl ?? null,
      },
      isOnline,
    });
  }
  return friends;
}

export async function getReceivedRequests(userId: number): Promise<FriendRequestWithProfile[]> {
  const requests = await prisma.friendRequest.findMany({
    where: { receiverId: userId, status: 'PENDING' },
    include: {
      sender: { include: { profile: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return requests.map((r) => ({
    id: r.id,
    senderId: r.senderId,
    profile: {
      id: r.sender.profile?.id ?? 0,
      name: r.sender.profile?.name ?? 'Unnamed',
      imageUrl: r.sender.profile?.imageUrl ?? null,
    },
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getFriendStatus(userId: number, otherUserId: number): Promise<FriendStatusResponse> {
  const userIdA = Math.min(userId, otherUserId);
  const userIdB = Math.max(userId, otherUserId);

  const friendship = await prisma.friendship.findUnique({
    where: { userIdA_userIdB: { userIdA, userIdB } },
  });
  if (friendship) {
    return { status: 'friends' };
  }

  const sentRequest = await prisma.friendRequest.findUnique({
    where: { senderId_receiverId: { senderId: userId, receiverId: otherUserId } },
  });
  if (sentRequest) {
    if (sentRequest.status === 'PENDING') {
      return { status: 'pending_sent' };
    }
    if (sentRequest.status === 'REJECTED') {
      return { status: 'rejected' };
    }
  }

  const receivedRequest = await prisma.friendRequest.findUnique({
    where: { senderId_receiverId: { senderId: otherUserId, receiverId: userId } },
  });
  if (receivedRequest) {
    if (receivedRequest.status === 'PENDING') {
      return { status: 'pending_received', requestId: receivedRequest.id };
    }
    if (receivedRequest.status === 'REJECTED') {
      return { status: 'rejected' };
    }
  }

  return { status: 'none' };
}
