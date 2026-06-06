import {
  createOrGetPrivateChatController,
  getMessagesController,
  sendMessageController,
  markSeenController,
} from '../features/chat/chat.controller';
import * as chatService from '../features/chat/chat.service';
import type { AuthenticatedRequest } from '../shared/types/auth';
import type { Response } from 'express';

jest.mock('../features/chat/chat.service');

const mockService = chatService as jest.Mocked<typeof chatService>;

function createMockReq(overrides: any = {}): AuthenticatedRequest {
  return {
    user: { id: 1 },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as AuthenticatedRequest;
}

function createMockRes(): Response {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

describe('Chat Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrGetPrivateChatController', () => {
    it('should return 200 with chat on success', async () => {
      const req = createMockReq({ params: { userId: '2' } });
      const res = createMockRes();
      mockService.getOrCreatePrivateChat.mockResolvedValue({
        chatId: 5,
        otherUser: { id: 20, userId: 2, name: 'Bob', imageUrl: null },
      });

      await createOrGetPrivateChatController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        chatId: 5,
        otherUser: { id: 20, userId: 2, name: 'Bob', imageUrl: null },
      });
    });

    it('should return 401 if no user', async () => {
      const req = createMockReq({ user: undefined });
      const res = createMockRes();

      await createOrGetPrivateChatController(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 400 on invalid userId', async () => {
      const req = createMockReq({ params: { userId: 'abc' } });
      const res = createMockRes();

      await createOrGetPrivateChatController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 on service error', async () => {
      const req = createMockReq({ params: { userId: '2' } });
      const res = createMockRes();
      mockService.getOrCreatePrivateChat.mockRejectedValue(new Error('DB error'));

      await createOrGetPrivateChatController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getMessagesController', () => {
    it('should return 200 with messages on success', async () => {
      const req = createMockReq({
        params: { chatId: '5' },
        query: { limit: '50' },
      });
      const res = createMockRes();
      mockService.getPaginatedMessages.mockResolvedValue({
        messages: [],
        nextCursor: null,
        hasMore: false,
      });

      await getMessagesController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 401 if no user', async () => {
      const req = createMockReq({ user: undefined });
      const res = createMockRes();

      await getMessagesController(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 403 if not a member', async () => {
      const req = createMockReq({
        params: { chatId: '5' },
        query: { limit: '50' },
      });
      const res = createMockRes();
      mockService.getPaginatedMessages.mockRejectedValue(new Error('Not a member of this chat'));

      await getMessagesController(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 500 on unexpected error', async () => {
      const req = createMockReq({
        params: { chatId: '5' },
        query: { limit: '50' },
      });
      const res = createMockRes();
      mockService.getPaginatedMessages.mockRejectedValue(new Error('DB error'));

      await getMessagesController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('sendMessageController', () => {
    it('should return 201 with message on success', async () => {
      const req = createMockReq({
        params: { chatId: '5' },
        body: { content: 'hello' },
      });
      const res = createMockRes();
      mockService.createMessage.mockResolvedValue({
        id: 10,
        chatId: 5,
        senderId: 1,
        content: 'hello',
        seen: false,
        sentAt: '2026-01-01T00:00:00.000Z',
      });

      await sendMessageController(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 401 if no user', async () => {
      const req = createMockReq({ user: undefined });
      const res = createMockRes();

      await sendMessageController(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 403 if not a member', async () => {
      const req = createMockReq({
        params: { chatId: '5' },
        body: { content: 'hello' },
      });
      const res = createMockRes();
      mockService.createMessage.mockRejectedValue(new Error('Not a member of this chat'));

      await sendMessageController(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 500 on unexpected error', async () => {
      const req = createMockReq({
        params: { chatId: '5' },
        body: { content: 'hello' },
      });
      const res = createMockRes();
      mockService.createMessage.mockRejectedValue(new Error('DB error'));

      await sendMessageController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('markSeenController', () => {
    it('should return 200 with result on success', async () => {
      const req = createMockReq({ params: { chatId: '5' } });
      const res = createMockRes();
      mockService.markMessagesAsSeen.mockResolvedValue({ updatedCount: 3 });

      await markSeenController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ updatedCount: 3 });
    });

    it('should return 401 if no user', async () => {
      const req = createMockReq({ user: undefined });
      const res = createMockRes();

      await markSeenController(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 403 if not a member', async () => {
      const req = createMockReq({ params: { chatId: '5' } });
      const res = createMockRes();
      mockService.markMessagesAsSeen.mockRejectedValue(new Error('Not a member of this chat'));

      await markSeenController(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 500 on unexpected error', async () => {
      const req = createMockReq({ params: { chatId: '5' } });
      const res = createMockRes();
      mockService.markMessagesAsSeen.mockRejectedValue(new Error('DB error'));

      await markSeenController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
