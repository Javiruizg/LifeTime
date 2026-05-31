import * as SecureStore from 'expo-secure-store';
import { api } from '../../src/shared/lib/api';

const mockApiGet = jest.fn();
const mockApiPut = jest.fn();

jest.mock('../../src/shared/lib/api', () => ({
  api: {
    get: (...args: any[]) => mockApiGet(...args),
    put: (...args: any[]) => mockApiPut(...args),
  },
}));

const mockGetItemAsync = jest.spyOn(SecureStore, 'getItemAsync');
const mockSetItemAsync = jest.spyOn(SecureStore, 'setItemAsync');
const mockDeleteItemAsync = jest.spyOn(SecureStore, 'deleteItemAsync');

describe('Profile Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMyProfile', () => {
    it('should fetch the user profile', async () => {
      const mockProfile = {
        id: 1,
        userId: 1,
        name: 'Test User',
        message: 'Hello',
        imageUrl: 'http://example.com/avatar.png',
      };
      mockApiGet.mockResolvedValue({ data: mockProfile });

      const { getMyProfile } = require('../../src/features/profile/profile.service');
      const result = await getMyProfile();

      expect(mockApiGet).toHaveBeenCalledWith('/profile/me');
      expect(result).toEqual(mockProfile);
    });

    it('should propagate errors from API', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'));

      const { getMyProfile } = require('../../src/features/profile/profile.service');

      await expect(getMyProfile()).rejects.toThrow('Network error');
    });

    it('should handle profile with null imageUrl', async () => {
      const mockProfile = {
        id: 1,
        userId: 1,
        name: 'Test User',
        message: 'Hello',
        imageUrl: null,
      };
      mockApiGet.mockResolvedValue({ data: mockProfile });

      const { getMyProfile } = require('../../src/features/profile/profile.service');
      const result = await getMyProfile();

      expect(result.imageUrl).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('should update profile with name and message', async () => {
      const updateInput = { name: 'New Name', message: 'New message' };
      const updatedProfile = {
        id: 1,
        userId: 1,
        name: 'New Name',
        message: 'New message',
        imageUrl: null,
      };
      mockApiPut.mockResolvedValue({ data: updatedProfile });

      const { updateProfile } = require('../../src/features/profile/profile.service');
      const result = await updateProfile(updateInput);

      expect(mockApiPut).toHaveBeenCalledWith('/profile/me', updateInput);
      expect(result).toEqual(updatedProfile);
    });

    it('should update profile with only name', async () => {
      const updateInput = { name: 'New Name Only' };
      const updatedProfile = {
        id: 1,
        userId: 1,
        name: 'New Name Only',
        message: 'Old message',
        imageUrl: null,
      };
      mockApiPut.mockResolvedValue({ data: updatedProfile });

      const { updateProfile } = require('../../src/features/profile/profile.service');
      const result = await updateProfile(updateInput);

      expect(result.name).toBe('New Name Only');
    });

    it('should update profile with only message', async () => {
      const updateInput = { message: 'New message only' };
      const updatedProfile = {
        id: 1,
        userId: 1,
        name: 'Old Name',
        message: 'New message only',
        imageUrl: null,
      };
      mockApiPut.mockResolvedValue({ data: updatedProfile });

      const { updateProfile } = require('../../src/features/profile/profile.service');
      const result = await updateProfile(updateInput);

      expect(result.message).toBe('New message only');
    });

    it('should propagate errors from API during update', async () => {
      mockApiPut.mockRejectedValue(new Error('Update failed'));

      const { updateProfile } = require('../../src/features/profile/profile.service');

      await expect(updateProfile({ name: 'Test' })).rejects.toThrow('Update failed');
    });
  });
});