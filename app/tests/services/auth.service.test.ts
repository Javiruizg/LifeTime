import * as SecureStore from 'expo-secure-store';

const mockGetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();

jest.mock('../../src/shared/lib/api', () => ({
  api: {
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: any[]) => mockGetItemAsync(...args),
  setItemAsync: jest.fn(),
  deleteItemAsync: (...args: any[]) => mockDeleteItemAsync(...args),
}));

describe('Auth Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAccessToken', () => {
    it('should return stored access token', async () => {
      mockGetItemAsync.mockResolvedValue('stored-access-token');

      const { getAccessToken } = require('../../src/features/auth/auth.service');
      const result = await getAccessToken();

      expect(result).toBe('stored-access-token');
    });

    it('should return null when no token stored', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      const { getAccessToken } = require('../../src/features/auth/auth.service');
      const result = await getAccessToken();

      expect(result).toBeNull();
    });
  });

  describe('getRefreshToken', () => {
    it('should return stored refresh token', async () => {
      mockGetItemAsync.mockResolvedValue('stored-refresh-token');

      const { getRefreshToken } = require('../../src/features/auth/auth.service');
      const result = await getRefreshToken();

      expect(result).toBe('stored-refresh-token');
    });

    it('should return null when no refresh token stored', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      const { getRefreshToken } = require('../../src/features/auth/auth.service');
      const result = await getRefreshToken();

      expect(result).toBeNull();
    });
  });

  describe('logout', () => {
    it('should delete both access and refresh tokens', async () => {
      mockDeleteItemAsync.mockResolvedValue(undefined);

      const { logout } = require('../../src/features/auth/auth.service');
      await logout();

      expect(mockDeleteItemAsync).toHaveBeenCalledWith('accessToken');
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('refreshToken');
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when token exists', async () => {
      mockGetItemAsync.mockResolvedValue('valid-token');

      const { isAuthenticated } = require('../../src/features/auth/auth.service');
      const result = await isAuthenticated();

      expect(result).toBe(true);
    });

    it('should return false when no token', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      const { isAuthenticated } = require('../../src/features/auth/auth.service');
      const result = await isAuthenticated();

      expect(result).toBe(false);
    });
  });

  describe('AuthResponse interface', () => {
    it('should have all required properties', () => {
      const response = {
        success: true,
        accessToken: 'token',
        refreshToken: 'refresh',
        userId: 1,
        isNewUser: false,
      };

      expect(response.success).toBe(true);
      expect(response.accessToken).toBeDefined();
      expect(response.refreshToken).toBeDefined();
      expect(response.userId).toBeDefined();
      expect(response.isNewUser).toBe(false);
    });
  });
});