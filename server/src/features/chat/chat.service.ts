import { prisma } from '../../shared/lib/prisma';
import type {
  ChatMessageResponse,
  PrivateChatResponse,
  PaginatedMessagesResponse,
  MarkSeenResponse,
} from './chat.types';

function toMessageResponse(
  msg: {
    id: number;
    chatId: number;
    senderId: number;
    content: string;
    seen: boolean;
    sentAt: Date;
  },
  profile?: { id: number; name: string; imageUrl: string | null } | null
): ChatMessageResponse {
  const response: ChatMessageResponse = {
    id: msg.id,
    chatId: msg.chatId,
    senderId: msg.senderId,
    content: msg.content,
    seen: msg.seen,
    sentAt: msg.sentAt.toISOString(),
  };

  if (profile) {
    response.senderProfile = {
      id: profile.id,
      name: profile.name,
      imageUrl: profile.imageUrl,
    };
  }

  return response;
}

export async function getOrCreatePrivateChat(
  currentUserId: number,
  otherUserId: number
): Promise<PrivateChatResponse> {
  const findChat = () =>
    prisma.chat.findFirst({
      where: {
        privateChat: { isNot: null },
        AND: [
          { members: { some: { userId: currentUserId } } },
          { members: { some: { userId: otherUserId } } },
        ],
      },
      include: {
        members: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });

  const existingChat = await findChat();

  if (existingChat) {
    const otherMember = existingChat.members.find((m: { userId: number }) => m.userId !== currentUserId);
    const otherProfile = otherMember?.user?.profile;
    if (!otherProfile) {
      throw new Error('Other user profile not found');
    }
    return {
      chatId: existingChat.id,
      otherUser: {
        id: otherProfile.id,
        userId: otherProfile.userId ?? 0,
        name: otherProfile.name,
        imageUrl: otherProfile.imageUrl ?? null,
      },
    };
  }

  // Verify other user exists and has a profile
  const otherUser = await prisma.user.findUnique({
    where: { id: otherUserId },
    include: { profile: true },
  });

  if (!otherUser || !otherUser.profile) {
    throw new Error('Other user not found');
  }

  // Create new chat, private chat, and memberships
  const chat = await prisma.chat.create({
    data: {
      privateChat: {
        create: {
          maxMembers: 2,
        },
      },
      members: {
        create: [
          { userId: currentUserId, role: 'MEMBER' },
          { userId: otherUserId, role: 'MEMBER' },
        ],
      },
    },
    include: {
      members: {
        include: {
          user: {
            include: {
              profile: true,
            },
          },
        },
      },
    },
  });

  const otherMember = chat.members.find((m: { userId: number }) => m.userId !== currentUserId);
  const otherProfile = otherMember?.user?.profile;
  if (!otherProfile) {
    throw new Error('Other user profile not found after creation');
  }

  return {
    chatId: chat.id,
    otherUser: {
      id: otherProfile.id,
      userId: otherProfile.userId ?? 0,
      name: otherProfile.name,
      imageUrl: otherProfile.imageUrl ?? null,
    },
  };
}

export async function getPaginatedMessages(
  chatId: number,
  userId: number,
  limit: number,
  cursor?: number
): Promise<PaginatedMessagesResponse> {
  // Verify user is a member of this chat
  const membership = await prisma.chatMember.findUnique({
    where: {
      userId_chatId: {
        userId,
        chatId,
      },
    },
  });

  if (!membership) {
    throw new Error('Not a member of this chat');
  }

  const messages = await prisma.message.findMany({
    where: {
      chatId,
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    orderBy: { sentAt: 'desc' },
    take: limit + 1,
    include: {
      sender: {
        include: {
          profile: true,
        },
      },
    },
  });

  const hasMore = messages.length > limit;
  if (hasMore) {
    messages.pop();
  }

  return {
    messages: messages.map((msg) =>
      toMessageResponse(msg, msg.sender.profile)
    ),
    nextCursor: hasMore ? messages[messages.length - 1].id : null,
    hasMore,
  };
}

export async function createMessage(
  chatId: number,
  senderId: number,
  content: string
): Promise<ChatMessageResponse> {
  // Verify sender is a member
  const membership = await prisma.chatMember.findUnique({
    where: {
      userId_chatId: {
        userId: senderId,
        chatId,
      },
    },
  });

  if (!membership) {
    throw new Error('Not a member of this chat');
  }

  const message = await prisma.message.create({
    data: {
      chatId,
      senderId,
      content,
      seen: false,
    },
    include: {
      sender: {
        include: {
          profile: true,
        },
      },
    },
  });

  return toMessageResponse(message, message.sender.profile);
}

export async function markMessagesAsSeen(
  chatId: number,
  userId: number
): Promise<MarkSeenResponse> {
  // Verify membership
  const membership = await prisma.chatMember.findUnique({
    where: {
      userId_chatId: {
        userId,
        chatId,
      },
    },
  });

  if (!membership) {
    throw new Error('Not a member of this chat');
  }

  const result = await prisma.message.updateMany({
    where: {
      chatId,
      senderId: { not: userId },
      seen: false,
    },
    data: {
      seen: true,
    },
  });

  return { updatedCount: result.count };
}

export async function hasUnreadFromUser(
  currentUserId: number,
  otherUserId: number
): Promise<boolean> {
  const chat = await prisma.chat.findFirst({
    where: {
      privateChat: { isNot: null },
      AND: [
        { members: { some: { userId: currentUserId } } },
        { members: { some: { userId: otherUserId } } },
      ],
    },
    select: { id: true },
  });

  if (!chat) {
    return false;
  }

  const unread = await prisma.message.findFirst({
    where: {
      chatId: chat.id,
      senderId: otherUserId,
      seen: false,
    },
    select: { id: true },
  });

  return !!unread;
}

export async function getOtherUserIdInChat(
  chatId: number,
  currentUserId: number
): Promise<number | null> {
  const member = await prisma.chatMember.findFirst({
    where: {
      chatId,
      userId: { not: currentUserId },
    },
    select: { userId: true },
  });

  return member?.userId ?? null;
}

export async function getOtherMemberIdsInChat(
  chatId: number,
  currentUserId: number
): Promise<number[]> {
  const members = await prisma.chatMember.findMany({
    where: {
      chatId,
      userId: { not: currentUserId },
    },
    select: { userId: true },
  });

  return members.map((m) => m.userId);
}

/**
 * Batch check unread status for multiple users.
 * Returns a Map where key = otherUserId, value = hasUnread boolean.
 * This replaces the N+1 queries of calling hasUnreadFromUser in a loop.
 */
export async function hasUnreadFromMultipleUsers(
  currentUserId: number,
  otherUserIds: number[]
): Promise<Map<number, boolean>> {
  if (otherUserIds.length === 0) {
    return new Map();
  }

  // Find all private chats where currentUserId is a member
  const chats = await prisma.chat.findMany({
    where: {
      privateChat: { isNot: null },
      members: {
        some: { userId: currentUserId },
      },
    },
    include: {
      members: { select: { userId: true } },
    },
  });

  // Map: chatId -> otherUserId
  const chatToUser = new Map<number, number>();
  for (const chat of chats) {
    const otherMember = chat.members.find((m) => m.userId !== currentUserId);
    if (otherMember && otherUserIds.includes(otherMember.userId)) {
      chatToUser.set(chat.id, otherMember.userId);
    }
  }

  // Batch check unread for all relevant chats
  const relevantChatIds = Array.from(chatToUser.keys());
  const unreadMessages = await prisma.message.findMany({
    where: {
      chatId: { in: relevantChatIds },
      senderId: { not: currentUserId },
      seen: false,
    },
    select: { chatId: true },
    distinct: ['chatId'],
  });

  const unreadChatIds = new Set(unreadMessages.map((m) => m.chatId));
  const result = new Map<number, boolean>();
  for (const [chatId, userId] of chatToUser) {
    result.set(userId, unreadChatIds.has(chatId));
  }

  // Fill missing users with false
  for (const uid of otherUserIds) {
    if (!result.has(uid)) {
      result.set(uid, false);
    }
  }

  return result;
}
