process.env.JWT_SECRET = 'test_secret_key_for_socket_tests';

import type { Server as HttpServer } from 'http';
import { setupSocket } from '../websocket/socket';
import type { SocketData } from '../shared/types/auth';

const JWT_SECRET = process.env.JWT_SECRET!;

type MockNextFn = (err?: Error) => void;
type MockMiddlewareFn = (socket: MockSocket, next: MockNextFn) => void | Promise<void>;

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

  describe('Auth middleware behavior', () => {
    beforeEach(() => {
      setupSocket(mockHttpServer as HttpServer);
    });

    async function callMiddleware(token?: string): Promise<{ error?: Error; proceeded?: boolean }> {
      const middleware = getMiddleware();
      const socket = createMockSocket(token);
      let err: Error | undefined;
      let proceeded = false;

      await middleware(socket, (cbErr?: Error) => {
        err = cbErr;
        proceeded = !cbErr;
      });

      return { error: err, proceeded };
    }
    
  });

  describe('Connection handler behavior', () => {
    beforeEach(() => {
      setupSocket(mockHttpServer as HttpServer);
      const onCall = mockIo.on.mock.calls.find(([evt]) => evt === 'connection');
      if (onCall) {
        connectionHandler = onCall[1] as (socket: MockSocket) => void;
      }
    });

  });
});