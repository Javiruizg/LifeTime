import {
  getOrCreatePrivateChat,
  getMessages,
  sendMessageRest,
  markMessagesAsSeen,
} from '../../src/features/chat/chat.service';
import { api } from '../../src/shared/lib/api';

jest.mock('../../src/shared/lib/api', () => ({
  api: {
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
  },
}));

const mockApi = api as jest.Mocked<typeof api>;

describe('Chat Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrCreatePrivateChat', () => {
    it('should POST to /chat/private/:userId and return response', async () => {
      const mockResponse = {
        data: {
          chatId: 5,
          otherUser: { id: 20, userId: 2, name: 'Bob', imageUrl: null },
        },
      };
      mockApi.post.mockResolvedValue(mockResponse);

      const result = await getOrCreatePrivateChat(2);

      expect(mockApi.post).toHaveBeenCalledWith('/chat/private/2');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getMessages', () => {
    it('should GET /chat/:chatId/messages with default limit', async () => {
      const mockResponse = {
        data: {
          messages: [],
          nextCursor: null,
          hasMore: false,
        },
      };
      mockApi.get.mockResolvedValue(mockResponse);

      const result = await getMessages(5);

      expect(mockApi.get).toHaveBeenCalledWith('/chat/5/messages', {
        params: { limit: 50, cursor: undefined },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('should pass custom limit and cursor', async () => {
      mockApi.get.mockResolvedValue({ data: { messages: [], nextCursor: null, hasMore: false } });

      await getMessages(5, 20, 100);

      expect(mockApi.get).toHaveBeenCalledWith('/chat/5/messages', {
        params: { limit: 20, cursor: 100 },
      });
    });
  });

  describe('sendMessageRest', () => {
    it('should POST to /chat/:chatId/messages with content', async () => {
      const mockResponse = {
        data: {
          id: 10,
          chatId: 5,
          senderId: 1,
          content: 'hello',
          seen: false,
          sentAt: '2026-01-01T00:00:00.000Z',
        },
      };
      mockApi.post.mockResolvedValue(mockResponse);

      const result = await sendMessageRest(5, 'hello');

      expect(mockApi.post).toHaveBeenCalledWith('/chat/5/messages', { content: 'hello' });
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('markMessagesAsSeen', () => {
    it('should PUT to /chat/:chatId/seen', async () => {
      const mockResponse = { data: { updatedCount: 3 } };
      mockApi.put.mockResolvedValue(mockResponse);

      const result = await markMessagesAsSeen(5);

      expect(mockApi.put).toHaveBeenCalledWith('/chat/5/seen');
      expect(result).toEqual({ updatedCount: 3 });
    });
  });
});
