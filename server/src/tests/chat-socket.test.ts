import { registerChatSocketHandlers } from '../features/chat/chat.socket';
import * as chatService from '../features/chat/chat.service';
import { prisma } from '../shared/lib/prisma';

jest.mock('../features/chat/chat.service');
jest.mock('../shared/middleware/rateLimit', () => ({
  checkWsRateLimit: jest.fn().mockResolvedValue(true),
  checkWsConnectionRateLimit: jest.fn().mockResolvedValue(true),
}));
jest.mock('../shared/lib/prisma', () => ({
  prisma: {
    chatMember: {
      findUnique: jest.fn(),
    },
  },
}));

const mockService = chatService as jest.Mocked<typeof chatService>;
const mockPrisma = prisma as any;

interface MockSocket {
  id: string;
  data: { userId: number };
  join: jest.Mock;
  leave: jest.Mock;
  on: jest.Mock;
  emit: jest.Mock;
}

function createMockSocket(userId: number): MockSocket {
  return {
    id: `socket-${userId}`,
    data: { userId },
    join: jest.fn(),
    leave: jest.fn(),
    on: jest.fn(),
    emit: jest.fn(),
  };
}

describe('Chat Socket Handlers', () => {
  let mockIo: any;
  let connectionHandler: ((socket: MockSocket) => void) | null = null;
  let socketHandlers: Map<string, Function>;

  beforeEach(() => {
    jest.clearAllMocks();
    socketHandlers = new Map();

    mockIo = {
      on: jest.fn((event: string, handler: Function) => {
        if (event === 'connection') {
          connectionHandler = handler as any;
        }
      }),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    registerChatSocketHandlers(mockIo);
  });

  function simulateConnection(userId: number): MockSocket {
    const socket = createMockSocket(userId);
    socket.on.mockImplementation((event: string, handler: Function) => {
      socketHandlers.set(event, handler);
    });
    connectionHandler!(socket);
    return socket;
  }

  describe('chat:join', () => {
    it('should join the chat room when user is a member', async () => {
      const socket = simulateConnection(1);
      const handler = socketHandlers.get('chat:join');
      mockPrisma.chatMember.findUnique.mockResolvedValue({ userId: 1, chatId: 5 });

      await handler!({ chatId: 5 });

      expect(socket.join).toHaveBeenCalledWith('chat:5');
    });

    it('should reject join when user is not a member', async () => {
      const socket = simulateConnection(1);
      const handler = socketHandlers.get('chat:join');
      mockPrisma.chatMember.findUnique.mockResolvedValue(null);

      await handler!({ chatId: 5 });

      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('chat:error', { error: 'Not a member of this chat' });
    });

    it('should ignore invalid payload', async () => {
      const socket = simulateConnection(1);
      const handler = socketHandlers.get('chat:join');

      await handler!({ chatId: 'invalid' });

      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('chat:leave', () => {
    it('should leave the chat room when user is a member', async () => {
      const socket = simulateConnection(1);
      const handler = socketHandlers.get('chat:leave');
      mockPrisma.chatMember.findUnique.mockResolvedValue({ userId: 1, chatId: 5 });

      await handler!({ chatId: 5 });

      expect(socket.leave).toHaveBeenCalledWith('chat:5');
    });

    it('should reject leave when user is not a member', async () => {
      const socket = simulateConnection(1);
      const handler = socketHandlers.get('chat:leave');
      mockPrisma.chatMember.findUnique.mockResolvedValue(null);

      await handler!({ chatId: 5 });

      expect(socket.leave).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('chat:error', { error: 'Not a member of this chat' });
    });

    it('should ignore invalid payload', async () => {
      const socket = simulateConnection(1);
      const handler = socketHandlers.get('chat:leave');

      await handler!({});

      expect(socket.leave).not.toHaveBeenCalled();
    });
  });

  describe('chat:send', () => {
    it('should create message and emit to chat room', async () => {
      const socket = simulateConnection(1);
      const handler = socketHandlers.get('chat:send');

      mockService.createMessage.mockResolvedValue({
        id: 10,
        chatId: 5,
        senderId: 1,
        content: 'hello',
        seen: false,
        sentAt: '2026-01-01T00:00:00.000Z',
      });

      await handler!({ chatId: 5, content: 'hello' });

      expect(mockService.createMessage).toHaveBeenCalledWith(5, 1, 'hello');
      expect(mockIo.to).toHaveBeenCalledWith('chat:5');
      expect(mockIo.emit).toHaveBeenCalledWith('chat:message', expect.objectContaining({ id: 10 }));
    });

    it('should ignore invalid payload', async () => {
      const socket = simulateConnection(1);
      const handler = socketHandlers.get('chat:send');

      await handler!({ chatId: 'bad' });

      expect(mockService.createMessage).not.toHaveBeenCalled();
    });

    it('should emit error on service failure', async () => {
      const socket = simulateConnection(1);
      const handler = socketHandlers.get('chat:send');

      mockService.createMessage.mockRejectedValue(new Error('fail'));

      await handler!({ chatId: 5, content: 'hello' });

      expect(socket.emit).toHaveBeenCalledWith('chat:error', { error: 'Failed to send message' });
    });
  });

  describe('chat:seen', () => {
    it('should mark messages as seen and emit to room and other user', async () => {
      const socket = simulateConnection(1);
      const handler = socketHandlers.get('chat:seen');

      mockService.markMessagesAsSeen.mockResolvedValue({ updatedCount: 3 });
      mockService.getOtherUserIdInChat.mockResolvedValue(2);

      await handler!({ chatId: 5 });

      expect(mockService.markMessagesAsSeen).toHaveBeenCalledWith(5, 1);
      expect(mockIo.to).toHaveBeenCalledWith('chat:5');
      expect(mockIo.to).toHaveBeenCalledWith('user:2');
    });

    it('should not emit if no messages were updated', async () => {
      const socket = simulateConnection(1);
      const handler = socketHandlers.get('chat:seen');

      mockService.markMessagesAsSeen.mockResolvedValue({ updatedCount: 0 });

      await handler!({ chatId: 5 });

      expect(mockIo.emit).not.toHaveBeenCalled();
    });

    it('should ignore invalid payload', async () => {
      const socket = simulateConnection(1);
      const handler = socketHandlers.get('chat:seen');

      await handler!({});

      expect(mockService.markMessagesAsSeen).not.toHaveBeenCalled();
    });

    it('should emit error on service failure', async () => {
      const socket = simulateConnection(1);
      const handler = socketHandlers.get('chat:seen');

      mockService.markMessagesAsSeen.mockRejectedValue(new Error('fail'));

      await handler!({ chatId: 5 });

      expect(socket.emit).toHaveBeenCalledWith('chat:error', {
        error: 'Failed to mark messages as seen',
      });
    });
  });
});
