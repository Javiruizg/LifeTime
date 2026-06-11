process.env.JWT_SECRET = 'test_secret_key_for_socket_tests';

import { registerLocationSocketHandlers } from '../features/location/location.socket';
import redis from '../shared/lib/redis';
import * as locationEngine from '../features/location/location.engine';
import { prisma } from '../shared/lib/prisma';
import * as chatService from '../features/chat/chat.service';

jest.mock('../shared/lib/redis', () => ({
  __esModule: true,
  default: {
    exists: jest.fn(),
    hgetall: jest.fn(),
  },
}));

jest.mock('../features/location/location.engine', () => ({
  updateUserLocation: jest.fn(),
  findVisibleUsersFor: jest.fn(),
  findConnectedFriendsFor: jest.fn(),
}));

jest.mock('../shared/lib/prisma', () => ({
  prisma: {
    profile: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../features/chat/chat.service', () => ({
  hasUnreadFromUser: jest.fn(),
}));

const mockRedis = redis as any;
const mockEngine = locationEngine as jest.Mocked<typeof locationEngine>;
const mockPrisma = prisma as any;
const mockChatService = chatService as jest.Mocked<typeof chatService>;

interface MockSocket {
  id: string;
  data: { userId: number };
  on: jest.Mock;
  emit: jest.Mock;
}

function createMockSocket(userId: number): MockSocket {
  return {
    id: `socket-${userId}`,
    data: { userId },
    on: jest.fn(),
    emit: jest.fn(),
  };
}

describe('Location Socket Handlers', () => {
  let mockIo: any;
  let connectionHandler: ((socket: MockSocket) => Promise<void>) | null = null;
  let socketHandlers: Map<string, Function>;
  let intervalCallback: (() => Promise<void>) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    socketHandlers = new Map();
    intervalCallback = null;

    jest.spyOn(global, 'setInterval').mockImplementation((callback: any, _ms?: number) => {
      intervalCallback = callback;
      return 123 as any;
    });

    jest.spyOn(global, 'clearInterval').mockImplementation(() => {});

    mockIo = {
      on: jest.fn((event: string, handler: Function) => {
        if (event === 'connection') {
          connectionHandler = handler as any;
        }
      }),
    };

    registerLocationSocketHandlers(mockIo);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function simulateConnection(userId: number): Promise<MockSocket> {
    const socket = createMockSocket(userId);
    socket.on.mockImplementation((event: string, handler: Function) => {
      socketHandlers.set(event, handler);
    });
    await connectionHandler!(socket);
    return socket;
  }

  describe('connection without active session', () => {
    it('should not set up handlers if no session exists', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const socket = await simulateConnection(1);

      expect(socketHandlers.size).toBe(0);
      expect(setInterval).not.toHaveBeenCalled();
    });
  });

  describe('connection with active session', () => {
    beforeEach(() => {
      mockRedis.exists.mockResolvedValue(1);
    });

    it('should set up interval and handlers', async () => {
      const socket = await simulateConnection(1);

      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 7000);
      expect(socketHandlers.has('location:update')).toBe(true);
      expect(socketHandlers.has('disconnect')).toBe(true);
    });

    it('should emit session_expired and clear interval when session disappears', async () => {
      const socket = await simulateConnection(1);

      mockRedis.exists.mockResolvedValue(0);
      mockEngine.findVisibleUsersFor.mockResolvedValue([]);

      await intervalCallback!();

      expect(socket.emit).toHaveBeenCalledWith('location:session_expired');
      expect(clearInterval).toHaveBeenCalledWith(123);
    });

    it('should emit enriched visible users on interval', async () => {
      const socket = await simulateConnection(1);

      mockRedis.exists.mockResolvedValue(1);
      mockRedis.hgetall.mockResolvedValue({ lat: '37.38', lng: '-5.99' });
      mockEngine.findVisibleUsersFor.mockResolvedValue([
        { userId: '2', latitude: 37.38, longitude: -5.99, distance: 100 },
      ]);
      mockPrisma.profile.findUnique.mockResolvedValue({
        id: 20,
        userId: 2,
        name: 'Bob',
        imageUrl: null,
      });
      mockChatService.hasUnreadFromUser.mockResolvedValue(true);

      await intervalCallback!();

      expect(socket.emit).toHaveBeenCalledWith('location:users', {
        users: [
          {
            userId: 2,
            latitude: 37.38,
            longitude: -5.99,
            distance: 100,
            profile: { id: 20, userId: 2, name: 'Bob', imageUrl: null },
            hasUnread: true,
          },
        ],
        friends: [],
      });
      expect(socket.emit).toHaveBeenCalledWith('location:groups', []);
    });

    it('should fallback to null profile when DB is unavailable', async () => {
      const socket = await simulateConnection(1);

      mockRedis.exists.mockResolvedValue(1);
      mockRedis.hgetall.mockResolvedValue({ lat: '37.38', lng: '-5.99' });
      mockEngine.findVisibleUsersFor.mockResolvedValue([
        { userId: '2', latitude: 37.38, longitude: -5.99, distance: 100 },
      ]);
      mockPrisma.profile.findUnique.mockRejectedValue(new Error('DB down'));

      await intervalCallback!();

      expect(socket.emit).toHaveBeenCalledWith('location:users', {
        users: [
          {
            userId: 2,
            latitude: 37.38,
            longitude: -5.99,
            distance: 100,
            profile: null,
            hasUnread: false,
          },
        ],
        friends: [],
      });
      expect(socket.emit).toHaveBeenCalledWith('location:groups', []);
    });
  });

  describe('location:update', () => {
    beforeEach(() => {
      mockRedis.exists.mockResolvedValue(1);
    });


    it('should ignore invalid payload', async () => {
      const socket = await simulateConnection(1);
      const handler = socketHandlers.get('location:update');

      await handler!({ latitude: 'bad' });

      expect(mockEngine.updateUserLocation).not.toHaveBeenCalled();
    });

    it('should ignore update if session expired', async () => {
      const socket = await simulateConnection(1);
      const handler = socketHandlers.get('location:update');

      mockRedis.exists.mockResolvedValue(0);

      await handler!({ latitude: 37.38, longitude: -5.99 });

      expect(mockEngine.updateUserLocation).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should clear interval on disconnect', async () => {
      mockRedis.exists.mockResolvedValue(1);
      const socket = await simulateConnection(1);
      const handler = socketHandlers.get('disconnect');

      handler!();

      expect(clearInterval).toHaveBeenCalledWith(123);
    });
  });
});
