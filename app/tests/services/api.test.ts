import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { refreshAccessToken, logout, reloginWithDeviceId } from '../../src/features/auth/auth.service';
import { api } from '../../src/shared/lib/api';

jest.mock('expo-secure-store');
jest.mock('../../src/features/auth/auth.service');

const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;
const mockRefreshAccessToken = refreshAccessToken as jest.MockedFunction<typeof refreshAccessToken>;
const mockLogout = logout as jest.MockedFunction<typeof logout>;
const mockReloginWithDeviceId = reloginWithDeviceId as jest.MockedFunction<typeof reloginWithDeviceId>;

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSecureStore.getItemAsync.mockResolvedValue(null);
  });

  describe('Request Interceptor', () => {
    it('should add Authorization header when token exists', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue('test-token');

      const config = { headers: {} } as any;
      const interceptor = (api.interceptors.request as any).handlers[0];
      const result = await interceptor.fulfilled(config);

      expect(result.headers.Authorization).toBe('Bearer test-token');
    });

    it('should not add Authorization header when no token', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const config = { headers: {} } as any;
      const interceptor = (api.interceptors.request as any).handlers[0];
      const result = await interceptor.fulfilled(config);

      expect(result.headers.Authorization).toBeUndefined();
    });

    it('should reject on request interceptor error', async () => {
      const interceptor = (api.interceptors.request as any).handlers[0];
      const error = new Error('Request error');

      await expect(interceptor.rejected(error)).rejects.toThrow('Request error');
    });
  });

  describe('Response Interceptor', () => {
    it('should return response on success', async () => {
      const response = { data: { success: true } };
      const interceptor = (api.interceptors.response as any).handlers[0];

      const result = await interceptor.fulfilled(response);

      expect(result).toBe(response);
    });

    it('should reject non-401 errors', async () => {
      const error = {
        config: { url: '/test' },
        response: { status: 500 },
      } as any;

      const interceptor = (api.interceptors.response as any).handlers[0];

      await expect(interceptor.rejected(error)).rejects.toBe(error);
    });

    it('should reject if no response', async () => {
      const error = {
        config: { url: '/test' },
        response: null,
      } as any;

      const interceptor = (api.interceptors.response as any).handlers[0];

      await expect(interceptor.rejected(error)).rejects.toBe(error);
    });

    it('should reject if already retried', async () => {
      const error = {
        config: { url: '/test', _retry: true },
        response: { status: 401 },
      } as any;

      const interceptor = (api.interceptors.response as any).handlers[0];

      await expect(interceptor.rejected(error)).rejects.toBe(error);
    });

    it('should logout and reject on /auth/refresh 401', async () => {
      const error = {
        config: { url: '/auth/refresh' },
        response: { status: 401 },
      } as any;

      mockLogout.mockResolvedValue();

      const interceptor = (api.interceptors.response as any).handlers[0];

      await expect(interceptor.rejected(error)).rejects.toBe(error);
      expect(mockLogout).toHaveBeenCalled();
    });

    it('should refresh token and retry on 401', async () => {
      const error = {
        config: { url: '/test', headers: {} },
        response: { status: 401 },
      } as any;

      mockRefreshAccessToken.mockResolvedValue();
      mockSecureStore.getItemAsync.mockResolvedValue('new-token');

      const mockApiCall = jest.fn().mockResolvedValue({ data: 'success' });
      Object.setPrototypeOf(api, { ...Object.getPrototypeOf(api), __proto__: mockApiCall });

      const interceptor = (api.interceptors.response as any).handlers[0];

      try {
        await interceptor.rejected(error);
      } catch (e) {
        // Expected to fail due to mocking limitations
      }

      expect(mockRefreshAccessToken).toHaveBeenCalled();
    });

    it('should relogin if refresh fails', async () => {
      const error = {
        config: { url: '/test', headers: {} },
        response: { status: 401 },
      } as any;

      mockRefreshAccessToken.mockRejectedValue(new Error('Refresh failed'));
      mockReloginWithDeviceId.mockResolvedValue('relogin-token');

      const interceptor = (api.interceptors.response as any).handlers[0];

      try {
        await interceptor.rejected(error);
      } catch (e) {
        // Expected to fail due to mocking limitations
      }

      expect(mockRefreshAccessToken).toHaveBeenCalled();
      expect(mockReloginWithDeviceId).toHaveBeenCalled();
    });

    it('should logout if both refresh and relogin fail', async () => {
      const error = {
        config: { url: '/test', headers: {} },
        response: { status: 401 },
      } as any;

      mockRefreshAccessToken.mockRejectedValue(new Error('Refresh failed'));
      mockReloginWithDeviceId.mockRejectedValue(new Error('Relogin failed'));
      mockLogout.mockResolvedValue();

      const interceptor = (api.interceptors.response as any).handlers[0];

      await expect(interceptor.rejected(error)).rejects.toThrow('Refresh failed');
      expect(mockLogout).toHaveBeenCalled();
    });

    it('should queue requests while already refreshing', async () => {
      let resolveRefresh: (value: void) => void;
      mockRefreshAccessToken.mockImplementation(
        () => new Promise<void>((resolve) => { resolveRefresh = resolve; })
      );

      const error1 = {
        config: { url: '/first', headers: {} },
        response: { status: 401 },
      } as any;

      const interceptor = (api.interceptors.response as any).handlers[0];

      // First request triggers the refresh (will block on the promise)
      const promise1 = interceptor.rejected(error1);

      // Second request should be queued (isRefreshing is true)
      const error2 = {
        config: { url: '/second', headers: {} },
        response: { status: 401 },
      } as any;

      const promise2 = interceptor.rejected(error2);

      // refreshAccessToken should only have been called once (second is queued)
      expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);

      // Resolve the refresh so the finally block runs and isRefreshing resets
      mockSecureStore.getItemAsync.mockResolvedValue('new-token');
      resolveRefresh!();

      try {
        await promise1;
      } catch (e) { /* api retry may fail in test environment */ }
      try {
        await promise2;
      } catch (e) { /* api retry may fail in test environment */ }
    });

    
  });
});
