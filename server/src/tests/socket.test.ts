process.env.JWT_SECRET = 'test_secret_key_for_socket_tests';

import type { Server as HttpServer } from 'http';
import { setupSocket } from '../websocket/socket';
import type { SocketData } from '../shared/types/auth';
import jwt from 'jsonwebtoken'; // Asegúrate de importar jwt para firmar tokens de prueba

const JWT_SECRET = process.env.JWT_SECRET!;

type MockNextFn = (err?: Error) => void;
type MockMiddlewareFn = (socket: any, next: MockNextFn) => void | Promise<void>;

interface MockSocket {
  id: string;
  data: SocketData;
  handshake: { auth?: { token?: string } };
  join: jest.Mock;
  on: jest.Mock;
}

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
    mockHttpServer = { on: jest.fn() } as unknown as Partial<HttpServer>;
  });

  describe('Auth middleware behavior', () => {
    beforeEach(() => {
      setupSocket(mockHttpServer as HttpServer);
    });

    // SOLUCIÓN AL PUNTO 1: Envolver el callback en una Promesa real
    async function callMiddleware(token?: string): Promise<{ error?: Error; proceeded?: boolean; socket: MockSocket }> {
      const middleware = getMiddleware();
      const socket = createMockSocket(token);

      return new Promise((resolve) => {
        middleware(socket, (cbErr?: Error) => {
          resolve({
            error: cbErr,
            proceeded: !cbErr,
            socket
          });
        });
      });
    }

    // SOLUCIÓN AL PUNTO 2: Añadir tests reales con aserciones
    it('should reject connection if no token is provided', async () => {
      const { error, proceeded } = await callMiddleware(undefined);
      
      expect(proceeded).toBe(false);
      expect(error).toBeDefined();
      expect(error?.message).toContain('Authentication error'); // Ajusta según tu mensaje real
    });

    it('should accept connection and populate socket.data if token is valid', async () => {
      const validToken = jwt.sign({ userId: 42 }, JWT_SECRET);
      const { error, proceeded, socket } = await callMiddleware(validToken);

      expect(error).toBeUndefined();
      expect(proceeded).toBe(true);
      expect(socket.data.userId).toBe(42); // Verifica que tu middleware asigne el userId a socket.data
    });

    it('should reject connection if token is invalid or expired', async () => {
      const invalidToken = jwt.sign({ userId: 42 }, 'wrong_secret');
      const { error, proceeded } = await callMiddleware(invalidToken);

      expect(proceeded).toBe(false);
      expect(error).toBeDefined();
    });
  });

  describe('Connection handler behavior', () => {
    let connectionHandler: ((socket: MockSocket) => void) | null = null;

    beforeEach(() => {
      setupSocket(mockHttpServer as HttpServer);
      const onCall = mockIo.on.mock.calls.find(([evt]) => evt === 'connection');
      if (onCall) {
        connectionHandler = onCall[1] as (socket: MockSocket) => void;
      }
    });

    it('should handle incoming connection events', () => {
      expect(connectionHandler).toBeDefined();
      expect(typeof connectionHandler).toBe('function');
      
      // Aquí puedes simular una conexión exitosa si tu handler escucha eventos internos:
      const socket = createMockSocket();
      if (connectionHandler) {
        connectionHandler(socket);
        // expect(socket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      }
    });
  });
});