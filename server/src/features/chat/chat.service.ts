import { prisma } from '../../shared/lib/prisma';
import type {
  ChatMessageResponse,
  PrivateChatResponse,
  PaginatedMessagesResponse,
  MarkSeenResponse,
} from './chat.types';

function toMessageResponse(msg: {
  id: number;
  chatId: number;
  senderId: number;
  content: string;
  seen: boolean;
  sentAt: Date;
}): ChatMessageResponse {
  return {
    id: msg.id,
    chatId: msg.chatId,
    senderId: msg.senderId,
    content: msg.content,
    seen: msg.seen,
    sentAt: msg.sentAt.toISOString(),
  };
}

export async function getOrCreatePrivateChat(
  currentUserId: number,
  otherUserId: number
): Promise<PrivateChatResponse> {
  // Find existing private chat where both users are members
  const existingChat = await prisma.chat.findFirst({
    where: {
      privateChat: { isNot: null },
      members: {
        every: {
          userId: { in: [currentUserId, otherUserId] },
        },
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

  if (existingChat) {
    const otherMember = existingChat.members.find((m) => m.userId !== currentUserId);
    const otherProfile = otherMember?.user?.profile;
    if (!otherProfile) {
      throw new Error('Other user profile not found');
    }
    return {
      chatId: existingChat.id,
      otherUser: {
        id: otherProfile.id,
        userId: otherProfile.userId,
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

  const otherMember = chat.members.find((m) => m.userId !== currentUserId);
  const otherProfile = otherMember?.user?.profile;
  if (!otherProfile) {
    throw new Error('Other user profile not found after creation');
  }

  return {
    chatId: chat.id,
    otherUser: {
      id: otherProfile.id,
      userId: otherProfile.userId,
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
  });

  const hasMore = messages.length > limit;
  if (hasMore) {
    messages.pop();
  }

  return {
    messages: messages.map(toMessageResponse),
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
  });

  return toMessageResponse(message);
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
      members: {
        every: {
          userId: { in: [currentUserId, otherUserId] },
        },
      },
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
