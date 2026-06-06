import { io } from 'socket.io-client';
import {
  connectSocket,
  disconnectSocket,
  getSocket,
  onSocketAuthFailure,
} from '../../src/shared/lib/socket';
import {
  getAccessToken,
  refreshAccessToken,
  reloginWithDeviceId,
  logout,
} from '../../src/features/auth/auth.service';

jest.mock('socket.io-client', () => ({
  io: jest.fn(),
}));

jest.mock('../../src/features/auth/auth.service', () => ({
  getAccessToken: jest.fn(),
  refreshAccessToken: jest.fn(),
  reloginWithDeviceId: jest.fn(),
  logout: jest.fn(),
}));

const mockIo = io as jest.MockedFunction<typeof io>;
const mockGetAccessToken = getAccessToken as jest.MockedFunction<typeof getAccessToken>;
const mockRefreshAccessToken = refreshAccessToken as jest.MockedFunction<typeof refreshAccessToken>;
const mockReloginWithDeviceId = reloginWithDeviceId as jest.MockedFunction<typeof reloginWithDeviceId>;
const mockLogout = logout as jest.MockedFunction<typeof logout>;

describe('Socket Service', () => {
  let mockSocket: any;
  let connectErrorHandler: ((err: Error) => Promise<void>) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    disconnectSocket();

    mockGetAccessToken.mockResolvedValue('test-token');

    mockSocket = {
      connected: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn((event: string, handler: Function) => {
        if (event === 'connect_error') {
          connectErrorHandler = handler as any;
        }
      }),
      auth: {},
    };

    mockIo.mockReturnValue(mockSocket as any);
  });

  describe('onSocketAuthFailure', () => {
    it('should register and unregister listener', () => {
      const listener = jest.fn();
      const unsubscribe = onSocketAuthFailure(listener);

      expect(typeof unsubscribe).toBe('function');

      unsubscribe();
    });

    it('should not fail when unregistering non-existent listener', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      const unsubscribe1 = onSocketAuthFailure(listener1);
      onSocketAuthFailure(listener2);

      unsubscribe1();
    });
  });

  describe('connectSocket', () => {
    it('should return existing socket if already connected', async () => {
      mockSocket.connected = true;
      mockIo.mockReturnValue(mockSocket as any);

      const result1 = await connectSocket();
      const result2 = await connectSocket();

      expect(result1).toBe(result2);
      expect(mockIo).toHaveBeenCalledTimes(1);
    });

    it('should reuse disconnected socket', async () => {
      mockSocket.connected = false;
      mockIo.mockReturnValue(mockSocket as any);

      const result1 = await connectSocket();
      mockSocket.connected = false;
      const result2 = await connectSocket();

      expect(mockSocket.connect).toHaveBeenCalled();
      expect(result1).toBe(result2);
    });

    it('should throw if no access token', async () => {
      mockGetAccessToken.mockResolvedValue(null);

      await expect(connectSocket()).rejects.toThrow('No access token available');
    });

    it('should create new socket with token', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');

      const result = await connectSocket();

      expect(mockIo).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          auth: { token: 'test-token' },
          transports: ['websocket'],
        })
      );
      expect(result).toBe(mockSocket);
    });

    it('should register connect_error handler', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');

      await connectSocket();

      expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
    });
  });

  describe('connect_error handler', () => {
    beforeEach(async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      await connectSocket();
    });

    it('should ignore non-token-expired errors', async () => {
      const error = new Error('Connection refused');

      await connectErrorHandler!(error);

      expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    });

    it('should refresh token on token expired error', async () => {
      const error = new Error('token expired');
      mockRefreshAccessToken.mockResolvedValue();
      mockGetAccessToken.mockResolvedValue('new-token');

      await connectErrorHandler!(error);

      expect(mockRefreshAccessToken).toHaveBeenCalled();
      expect(mockSocket.auth).toEqual({ token: 'new-token' });
      expect(mockSocket.connect).toHaveBeenCalled();
    });

    it('should not refresh if already refreshing', async () => {
      const error = new Error('token expired');
      let resolveRefresh: (value: void) => void;
      mockRefreshAccessToken.mockImplementation(
        () => new Promise<void>((resolve) => { resolveRefresh = resolve; })
      );
      mockGetAccessToken.mockResolvedValue('new-token');

      // First call starts the refresh and blocks on the pending promise
      const promise1 = connectErrorHandler!(error);
      // Second call should return early because isRefreshingToken is true
      await connectErrorHandler!(error);

      expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);

      // Resolve the pending refresh to let the finally block reset isRefreshingToken
      resolveRefresh!();
      await promise1;
    });

    it('should relogin if refresh fails', async () => {
      const error = new Error('token expired');
      mockRefreshAccessToken.mockRejectedValue(new Error('Refresh failed'));
      mockReloginWithDeviceId.mockResolvedValue('relogin-token');

      await connectErrorHandler!(error);

      expect(mockRefreshAccessToken).toHaveBeenCalled();
      expect(mockReloginWithDeviceId).toHaveBeenCalled();
      expect(mockSocket.auth).toEqual({ token: 'relogin-token' });
      expect(mockSocket.connect).toHaveBeenCalled();
    });

    it('should logout and emit auth failure if both refresh and relogin fail', async () => {
      const error = new Error('token expired');
      mockRefreshAccessToken.mockRejectedValue(new Error('Refresh failed'));
      mockReloginWithDeviceId.mockRejectedValue(new Error('Relogin failed'));
      mockLogout.mockResolvedValue();

      const listener = jest.fn();
      onSocketAuthFailure(listener);

      await connectErrorHandler!(error);

      expect(mockLogout).toHaveBeenCalled();
      expect(listener).toHaveBeenCalled();
    });

    it('should throw if refresh succeeds but no token stored', async () => {
      const error = new Error('token expired');
      mockRefreshAccessToken.mockResolvedValue();
      mockGetAccessToken.mockResolvedValue(null);

      await connectErrorHandler!(error);

      expect(mockRefreshAccessToken).toHaveBeenCalled();
      expect(mockReloginWithDeviceId).toHaveBeenCalled();
    });
  });

  describe('disconnectSocket', () => {
    it('should disconnect and clear socket', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      await connectSocket();

      disconnectSocket();

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(getSocket()).toBeNull();
    });

    it('should be safe to call without socket', () => {
      expect(() => disconnectSocket()).not.toThrow();
    });
  });

  describe('getSocket', () => {
    it('should return null when no socket', () => {
      expect(getSocket()).toBeNull();
    });

    it('should return socket after connect', async () => {
      mockGetAccessToken.mockResolvedValue('test-token');
      await connectSocket();

      expect(getSocket()).toBe(mockSocket);
    });
  });
});
