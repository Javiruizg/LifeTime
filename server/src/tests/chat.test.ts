import {
  getOrCreatePrivateChat,
  getPaginatedMessages,
  createMessage,
  markMessagesAsSeen,
  hasUnreadFromUser,
  getOtherUserIdInChat,
} from '../features/chat/chat.service';
import { prisma } from '../shared/lib/prisma';

jest.mock('../shared/lib/prisma', () => ({
  prisma: {
    chat: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    chatMember: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as any;

describe('Chat Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrCreatePrivateChat', () => {
    it('should return existing chat if found', async () => {
      mockPrisma.chat.findFirst.mockResolvedValue({
        id: 1,
        members: [
          { userId: 1, user: { profile: { id: 10, userId: 1, name: 'Alice', imageUrl: null } } },
          { userId: 2, user: { profile: { id: 20, userId: 2, name: 'Bob', imageUrl: '/img.png' } } },
        ],
      } as any);

      const result = await getOrCreatePrivateChat(1, 2);

      expect(result.chatId).toBe(1);
      expect(result.otherUser.name).toBe('Bob');
      expect(result.otherUser.imageUrl).toBe('/img.png');
    });

    it('should throw if existing chat found but other profile missing', async () => {
      mockPrisma.chat.findFirst.mockResolvedValue({
        id: 1,
        members: [
          { userId: 1, user: { profile: { id: 10, userId: 1, name: 'Alice', imageUrl: null } } },
          { userId: 2, user: { profile: null } },
        ],
      } as any);

      await expect(getOrCreatePrivateChat(1, 2)).rejects.toThrow('Other user profile not found');
    });

    it('should create new chat if none exists', async () => {
      mockPrisma.chat.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 2,
        profile: { id: 20, userId: 2, name: 'Bob', imageUrl: null },
      } as any);
      mockPrisma.chat.create.mockResolvedValue({
        id: 5,
        members: [
          { userId: 1, user: { profile: { id: 10, userId: 1, name: 'Alice', imageUrl: null } } },
          { userId: 2, user: { profile: { id: 20, userId: 2, name: 'Bob', imageUrl: null } } },
        ],
      } as any);

      const result = await getOrCreatePrivateChat(1, 2);

      expect(result.chatId).toBe(5);
      expect(result.otherUser.name).toBe('Bob');
    });

    it('should throw if other user does not exist', async () => {
      mockPrisma.chat.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(getOrCreatePrivateChat(1, 999)).rejects.toThrow('Other user not found');
    });

    it('should throw if other user has no profile', async () => {
      mockPrisma.chat.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 2, profile: null } as any);

      await expect(getOrCreatePrivateChat(1, 2)).rejects.toThrow('Other user not found');
    });

    it('should throw if profile missing after creation', async () => {
      mockPrisma.chat.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 2,
        profile: { id: 20, userId: 2, name: 'Bob', imageUrl: null },
      } as any);
      mockPrisma.chat.create.mockResolvedValue({
        id: 5,
        members: [
          { userId: 1, user: { profile: null } },
          { userId: 2, user: { profile: null } },
        ],
      } as any);

      await expect(getOrCreatePrivateChat(1, 2)).rejects.toThrow(
        'Other user profile not found after creation'
      );
    });
  });

  describe('getPaginatedMessages', () => {
    it('should return messages when user is a member', async () => {
      mockPrisma.chatMember.findUnique.mockResolvedValue({ userId: 1, chatId: 5 } as any);
      mockPrisma.message.findMany.mockResolvedValue([
        { id: 1, chatId: 5, senderId: 2, content: 'hi', seen: false, sentAt: new Date('2026-01-01') },
      ] as any);

      const result = await getPaginatedMessages(5, 1, 50);

      expect(result.messages).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should throw if user is not a member', async () => {
      mockPrisma.chatMember.findUnique.mockResolvedValue(null);

      await expect(getPaginatedMessages(5, 1, 50)).rejects.toThrow('Not a member of this chat');
    });

    it('should handle pagination with cursor', async () => {
      mockPrisma.chatMember.findUnique.mockResolvedValue({ userId: 1, chatId: 5 } as any);
      const messages = Array.from({ length: 51 }, (_, i) => ({
        id: 51 - i,
        chatId: 5,
        senderId: 2,
        content: `msg ${51 - i}`,
        seen: false,
        sentAt: new Date(),
      }));
      mockPrisma.message.findMany.mockResolvedValue(messages as any);

      const result = await getPaginatedMessages(5, 1, 50, 100);

      expect(result.hasMore).toBe(true);
      expect(result.messages).toHaveLength(50);
      expect(result.nextCursor).toBeDefined();
    });
  });

  describe('createMessage', () => {
    it('should create and return message when user is a member', async () => {
      mockPrisma.chatMember.findUnique.mockResolvedValue({ userId: 1, chatId: 5 } as any);
      mockPrisma.message.create.mockResolvedValue({
        id: 10,
        chatId: 5,
        senderId: 1,
        content: 'hello',
        seen: false,
        sentAt: new Date('2026-01-01'),
      } as any);

      const result = await createMessage(5, 1, 'hello');

      expect(result.id).toBe(10);
      expect(result.content).toBe('hello');
    });

    it('should throw if user is not a member', async () => {
      mockPrisma.chatMember.findUnique.mockResolvedValue(null);

      await expect(createMessage(5, 1, 'hello')).rejects.toThrow('Not a member of this chat');
    });
  });

  describe('markMessagesAsSeen', () => {
    it('should mark messages and return count', async () => {
      mockPrisma.chatMember.findUnique.mockResolvedValue({ userId: 1, chatId: 5 } as any);
      mockPrisma.message.updateMany.mockResolvedValue({ count: 3 } as any);

      const result = await markMessagesAsSeen(5, 1);

      expect(result.updatedCount).toBe(3);
    });

    it('should throw if user is not a member', async () => {
      mockPrisma.chatMember.findUnique.mockResolvedValue(null);

      await expect(markMessagesAsSeen(5, 1)).rejects.toThrow('Not a member of this chat');
    });
  });

  describe('hasUnreadFromUser', () => {
    it('should return false if no chat exists', async () => {
      mockPrisma.chat.findFirst.mockResolvedValue(null);

      const result = await hasUnreadFromUser(1, 2);

      expect(result).toBe(false);
    });

    it('should return true if unread messages exist', async () => {
      mockPrisma.chat.findFirst.mockResolvedValue({ id: 5 } as any);
      mockPrisma.message.findFirst.mockResolvedValue({ id: 10 } as any);

      const result = await hasUnreadFromUser(1, 2);

      expect(result).toBe(true);
    });

    it('should return false if no unread messages', async () => {
      mockPrisma.chat.findFirst.mockResolvedValue({ id: 5 } as any);
      mockPrisma.message.findFirst.mockResolvedValue(null);

      const result = await hasUnreadFromUser(1, 2);

      expect(result).toBe(false);
    });
  });

  describe('getOtherUserIdInChat', () => {
    it('should return other user id', async () => {
      mockPrisma.chatMember.findFirst.mockResolvedValue({ userId: 2 } as any);

      const result = await getOtherUserIdInChat(5, 1);

      expect(result).toBe(2);
    });

    it('should return null if no other member found', async () => {
      mockPrisma.chatMember.findFirst.mockResolvedValue(null);

      const result = await getOtherUserIdInChat(5, 1);

      expect(result).toBeNull();
    });
  });
});
