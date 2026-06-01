process.env.JWT_SECRET = 'test_secret_key_for_socket_tests';

import type { Server as HttpServer } from 'http';
import { setupSocket } from '../websocket/socket';
import type { SocketData } from '../shared/types/auth';

const JWT_SECRET = process.env.JWT_SECRET!;

type MockNextFn = (err?: Error) => void;
type MockMiddlewareFn = (socket: MockSocket, next: MockNextFn) => void;

interface MockSocket {
  id: string;
  data: SocketData;
  handshake: { auth?: { token?: string } };
  join: jest.Mock;
  on: jest.Mock;
}

let connectionHandler: ((socket: MockSocket) => void) | null = null;

const mockIo: {
  use: jest.Mock;
  on: jest.Mock;
} = {
  use: jest.fn(),
  on: jest.fn(),
};

jest.mock('socket.io', () => ({
  Server: jest.fn(() => mockIo),
}));

function getMiddleware(): MockMiddlewareFn {
  const calls = mockIo.use.mock.calls;
  if (!calls.length || !calls[0][0]) {
    throw new Error('Middleware not registered yet. Did you call setupSocket?');
  }
  return calls[0][0] as MockMiddlewareFn;
}

function createMockSocket(token?: string): MockSocket {
  return {
    id: `mock-socket-${Math.random().toString(36).slice(2)}`,
    data: { userId: 0 } as SocketData,
    handshake: {
      auth: token ? { token } : {},
    },
    join: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  } as unknown as MockSocket;
}

describe('setupSocket', () => {
  let mockHttpServer: Partial<HttpServer>;

  beforeEach(() => {
    jest.clearAllMocks();
    connectionHandler = null;
    mockHttpServer = { on: jest.fn() } as unknown as Partial<HttpServer>;
  });

  describe('Server initialization', () => {
    it('should create a Socket.IO server without CORS config (mobile clients only)', () => {
      setupSocket(mockHttpServer as HttpServer);

      expect(require('socket.io').Server).toHaveBeenCalledWith(mockHttpServer);
    });
  });

  describe('Auth middleware behavior', () => {
    beforeEach(() => {
      setupSocket(mockHttpServer as HttpServer);
    });

    function callMiddleware(token?: string): { error?: Error; proceeded?: boolean } {
      const middleware = getMiddleware();
      const socket = createMockSocket(token);
      let err: Error | undefined;
      let proceeded = false;

      middleware(socket, (cbErr?: Error) => {
        err = cbErr;
        proceeded = !cbErr;
      });

      return { error: err, proceeded };
    }

    it('should reject connection with missing token', () => {
      const result = callMiddleware();
      expect(result.error).toBeDefined();
      expect(result.error!.message).toBe('Unauthorized: missing token');
      expect(result.proceeded).toBe(false);
    });

    it('should allow connection with a valid access token and attach userId to socket.data', () => {
      const jwt = require('jsonwebtoken');
      const validToken = jwt.sign({ userId: 99, type: 'access' }, JWT_SECRET);
      const socket = createMockSocket(validToken);
      const middleware = getMiddleware();

      middleware(socket, () => {});

      expect(socket.data.userId).toBe(99);
    });

    it('should reject connection with an expired token', () => {
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        { userId: 42, type: 'access', exp: Math.floor(Date.now() / 1000) - 10 },
        JWT_SECRET
      );
      const result = callMiddleware(expiredToken);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toBe('Unauthorized: token expired');
      expect(result.proceeded).toBe(false);
    });

    it('should reject connection with a malformed token', () => {
      const result = callMiddleware('not-a-valid-jwt');
      expect(result.error).toBeDefined();
      expect(result.error!.message).toBe('Unauthorized: invalid or malformed token');
      expect(result.proceeded).toBe(false);
    });
  });

  describe('Connection handler behavior', () => {
    beforeEach(() => {
      setupSocket(mockHttpServer as HttpServer);
      const onCall = mockIo.on.mock.calls.find(([evt]) => evt === 'connection');
      if (onCall) {
        connectionHandler = onCall[1] as (socket: MockSocket) => void;
      }
    });

    it('should join the user-specific room on connection', () => {
      const jwt = require('jsonwebtoken');
      const validToken = jwt.sign({ userId: 42, type: 'access' }, JWT_SECRET);
      const socket = createMockSocket(validToken);
      const middleware = getMiddleware();

      middleware(socket, () => {
        connectionHandler!(socket);
      });

      expect(socket.join).toHaveBeenCalledWith('user:42');
    });
  });
});