import {
  connectUserLocation,
  disconnectUserLocation,
  getUserLocationStatus,
} from '../features/location/location.service';
import redis from '../shared/lib/redis';

jest.mock('../shared/lib/redis', () => ({
  __esModule: true,
  default: {
    hset: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
    zrem: jest.fn(),
    hgetall: jest.fn(),
    ttl: jest.fn(),
  },
}));

const mockRedis = redis as jest.Mocked<typeof redis>;

describe('Location Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('connectUserLocation', () => {
    it('should create session in Redis with correct TTL and return result', async () => {
      mockRedis.hset.mockResolvedValue(1 as never);
      mockRedis.expire.mockResolvedValue(1 as never);

      const result = await connectUserLocation(42, 1000, 60);

      expect(mockRedis.hset).toHaveBeenCalledWith('location:session:42', {
        range: '1000',
        connectedAt: expect.any(String),
      });
      expect(mockRedis.expire).toHaveBeenCalledWith('location:session:42', 3600);
      expect(result).toHaveProperty('range', 1000);
      expect(result).toHaveProperty('expiresAt');
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('should set TTL based on durationMinutes', async () => {
      mockRedis.hset.mockResolvedValue(1 as never);
      mockRedis.expire.mockResolvedValue(1 as never);

      await connectUserLocation(1, 500, 30);

      expect(mockRedis.expire).toHaveBeenCalledWith('location:session:1', 1800);
    });
  });

  describe('disconnectUserLocation', () => {
    it('should delete session and remove from geo set', async () => {
      mockRedis.del.mockResolvedValue(1 as never);
      mockRedis.zrem.mockResolvedValue(1 as never);

      await disconnectUserLocation(42);

      expect(mockRedis.del).toHaveBeenCalledWith('location:session:42');
      expect(mockRedis.zrem).toHaveBeenCalledWith('geo:connected_users', '42');
    });
  });

  describe('getUserLocationStatus', () => {
    it('should return active:false when session does not exist', async () => {
      mockRedis.hgetall.mockResolvedValue({} as never);
      mockRedis.ttl.mockResolvedValue(-2 as never);

      const result = await getUserLocationStatus(42);

      expect(result).toEqual({ active: false });
    });

    it('should return active:false when TTL is negative', async () => {
      mockRedis.hgetall.mockResolvedValue({ range: '1000' } as never);
      mockRedis.ttl.mockResolvedValue(-1 as never);

      const result = await getUserLocationStatus(42);

      expect(result).toEqual({ active: false });
    });

    it('should return active:true with range and expiresAt when session exists', async () => {
      mockRedis.hgetall.mockResolvedValue({ range: '1000' } as never);
      mockRedis.ttl.mockResolvedValue(3000 as never);

      const result = await getUserLocationStatus(42);

      expect(result.active).toBe(true);
      expect(result.range).toBe(1000);
      expect(result).toHaveProperty('expiresAt');
    });
  });
});
