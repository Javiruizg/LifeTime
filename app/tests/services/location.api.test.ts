import { connectToLocation, disconnectFromLocation, getLocationStatus } from '../../src/features/location/location.api';
import { api } from '../../src/shared/lib/api';

jest.mock('../../src/shared/lib/api', () => ({
  api: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

const mockApi = api as jest.Mocked<typeof api>;

describe('Location API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('connectToLocation', () => {
    it('should POST to /location/connect and return response data', async () => {
      const mockResponse = {
        data: { range: 1000, expiresAt: '2026-01-01T01:00:00.000Z' },
      };
      mockApi.post.mockResolvedValue(mockResponse);

      const result = await connectToLocation({ range: 1000, durationMinutes: 60 });

      expect(mockApi.post).toHaveBeenCalledWith('/location/connect', { range: 1000, durationMinutes: 60 });
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('disconnectFromLocation', () => {
    it('should POST to /location/disconnect', async () => {
      mockApi.post.mockResolvedValue({ data: {} });

      await disconnectFromLocation();

      expect(mockApi.post).toHaveBeenCalledWith('/location/disconnect');
    });
  });

  describe('getLocationStatus', () => {
    it('should GET /location/status and return response data', async () => {
      const mockResponse = {
        data: { active: true, range: 1000, expiresAt: '2026-01-01T01:00:00.000Z' },
      };
      mockApi.get.mockResolvedValue(mockResponse);

      const result = await getLocationStatus();

      expect(mockApi.get).toHaveBeenCalledWith('/location/status');
      expect(result).toEqual(mockResponse.data);
    });

    it('should return inactive status when no session', async () => {
      mockApi.get.mockResolvedValue({ data: { active: false } });

      const result = await getLocationStatus();

      expect(result.active).toBe(false);
    });
  });
});
