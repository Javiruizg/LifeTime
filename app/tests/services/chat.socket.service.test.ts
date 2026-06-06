import {
  joinChat,
  leaveChat,
  sendMessageSocket,
  markSeenSocket,
  onChatMessage,
  onChatSeen,
  onChatError,
} from '../../src/features/chat/chat.socket.service';
import { getSocket } from '../../src/shared/lib/socket';

jest.mock('../../src/shared/lib/socket', () => ({
  getSocket: jest.fn(),
}));

const mockGetSocket = getSocket as jest.MockedFunction<typeof getSocket>;

describe('Chat Socket Service', () => {
  let mockSocket: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket = {
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    };
    mockGetSocket.mockReturnValue(mockSocket);
  });

  describe('joinChat', () => {
    it('should emit chat:join with chatId', () => {
      joinChat(5);
      expect(mockSocket.emit).toHaveBeenCalledWith('chat:join', { chatId: 5 });
    });

    it('should do nothing if socket is null', () => {
      mockGetSocket.mockReturnValue(null);
      expect(() => joinChat(5)).not.toThrow();
    });
  });

  describe('leaveChat', () => {
    it('should emit chat:leave with chatId', () => {
      leaveChat(5);
      expect(mockSocket.emit).toHaveBeenCalledWith('chat:leave', { chatId: 5 });
    });

    it('should do nothing if socket is null', () => {
      mockGetSocket.mockReturnValue(null);
      expect(() => leaveChat(5)).not.toThrow();
    });
  });

  describe('sendMessageSocket', () => {
    it('should emit chat:send with chatId and content', () => {
      sendMessageSocket(5, 'hello');
      expect(mockSocket.emit).toHaveBeenCalledWith('chat:send', { chatId: 5, content: 'hello' });
    });
  });

  describe('markSeenSocket', () => {
    it('should emit chat:seen with chatId', () => {
      markSeenSocket(5);
      expect(mockSocket.emit).toHaveBeenCalledWith('chat:seen', { chatId: 5 });
    });
  });

  describe('onChatMessage', () => {
    it('should register listener and return unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = onChatMessage(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('chat:message', callback);
      expect(typeof unsubscribe).toBe('function');

      unsubscribe();
      expect(mockSocket.off).toHaveBeenCalledWith('chat:message', callback);
    });

    it('should return noop if socket is null', () => {
      mockGetSocket.mockReturnValue(null);
      const unsubscribe = onChatMessage(jest.fn());
      expect(typeof unsubscribe).toBe('function');
      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe('onChatSeen', () => {
    it('should register listener and return unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = onChatSeen(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('chat:seen', callback);

      unsubscribe();
      expect(mockSocket.off).toHaveBeenCalledWith('chat:seen', callback);
    });

    it('should return noop if socket is null', () => {
      mockGetSocket.mockReturnValue(null);
      const unsubscribe = onChatSeen(jest.fn());
      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe('onChatError', () => {
    it('should register listener and return unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = onChatError(callback);

      expect(mockSocket.on).toHaveBeenCalledWith('chat:error', callback);

      unsubscribe();
      expect(mockSocket.off).toHaveBeenCalledWith('chat:error', callback);
    });

    it('should return noop if socket is null', () => {
      mockGetSocket.mockReturnValue(null);
      const unsubscribe = onChatError(jest.fn());
      expect(() => unsubscribe()).not.toThrow();
    });
  });
});
