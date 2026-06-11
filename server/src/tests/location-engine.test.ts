import {
  updateUserLocation,
  findVisibleUsersFor,
  findConnectedFriendsFor,
} from '../features/location/location.engine';
import redis from '../shared/lib/redis';
import { prisma } from '../shared/lib/prisma';

jest.mock('../shared/lib/redis', () => ({
  __esModule: true,
  default: {
    hset: jest.fn(),
    geoadd: jest.fn(),
    hgetall: jest.fn(),
    georadius: jest.fn(),
    zrem: jest.fn(),
  },
}));

jest.mock('../shared/lib/prisma', () => ({
  prisma: {
    friendship: {
      findMany: jest.fn(),
    },
  },
}));

const mockRedis = redis as jest.Mocked<typeof redis>;
const mockPrisma = prisma as any;

describe('Location Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateUserLocation', () => {
    it('should update Redis hash and geo index', async () => {
      mockRedis.hset.mockResolvedValue(1 as never);
      mockRedis.geoadd.mockResolvedValue(1 as never);

      await updateUserLocation(42, 37.38, -5.99);

      expect(mockRedis.hset).toHaveBeenCalledWith(
        'location:session:42',
        'lat', '37.38',
        'lng', '-5.99'
      );
      expect(mockRedis.geoadd).toHaveBeenCalledWith(
        'geo:connected_users',
        -5.99, 37.38, '42'
      );
    });
  });

  describe('findVisibleUsersFor', () => {
    it('should return empty array when own session does not exist', async () => {
      mockRedis.hgetall.mockResolvedValue({} as never);

      const result = await findVisibleUsersFor(42);

      expect(result).toEqual([]);
    });

    it('should return empty array when own coordinates are NaN', async () => {
      mockRedis.hgetall.mockResolvedValue({
        lat: 'not-a-number',
        lng: 'not-a-number',
        range: '1000',
      } as never);

      const result = await findVisibleUsersFor(42);

      expect(result).toEqual([]);
    });

    it('should return visible users within mutual range', async () => {
      mockRedis.hgetall
        .mockResolvedValueOnce({ lat: '37.38', lng: '-5.99', range: '1000' } as never)
        .mockResolvedValueOnce({ lat: '37.381', lng: '-5.991', range: '1000' } as never);

      mockRedis.georadius.mockResolvedValue([
        ['42', '0'],
        ['99', '500'],
      ] as never);

      const result = await findVisibleUsersFor(42);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        userId: '99',
        latitude: 37.381,
        longitude: -5.991,
        distance: 500,
      });
    });

    it('should skip self in results', async () => {
      mockRedis.hgetall.mockResolvedValue({ lat: '37.38', lng: '-5.99', range: '1000' } as never);
      mockRedis.georadius.mockResolvedValue([['42', '0']] as never);

      const result = await findVisibleUsersFor(42);

      expect(result).toEqual([]);
    });

    it('should skip users outside their own range (mutual check)', async () => {
      mockRedis.hgetall
        .mockResolvedValueOnce({ lat: '37.38', lng: '-5.99', range: '2000' } as never)
        .mockResolvedValueOnce({ lat: '37.39', lng: '-6.00', range: '100' } as never);

      mockRedis.georadius.mockResolvedValue([['99', '500']] as never);

      const result = await findVisibleUsersFor(42);

      expect(result).toEqual([]);
    });

    it('should perform lazy cleanup of stale geo entries', async () => {
      mockRedis.hgetall
        .mockResolvedValueOnce({ lat: '37.38', lng: '-5.99', range: '1000' } as never)
        .mockResolvedValueOnce({} as never);

      mockRedis.georadius.mockResolvedValue([['99', '500']] as never);
      mockRedis.zrem.mockResolvedValue(1 as never);

      const result = await findVisibleUsersFor(42);

      expect(result).toEqual([]);
      expect(mockRedis.zrem).toHaveBeenCalledWith('geo:connected_users', '99');
    });

    it('should skip entries with NaN distance', async () => {
      mockRedis.hgetall.mockResolvedValue({ lat: '37.38', lng: '-5.99', range: '1000' } as never);
      mockRedis.georadius.mockResolvedValue([['99', 'not-a-number']] as never);

      const result = await findVisibleUsersFor(42);

      expect(result).toEqual([]);
    });

    it('should default NaN lat/lng to 0 for other users', async () => {
      mockRedis.hgetall
        .mockResolvedValueOnce({ lat: '37.38', lng: '-5.99', range: '1000' } as never)
        .mockResolvedValueOnce({ lat: 'bad', lng: 'bad', range: '1000' } as never);

      mockRedis.georadius.mockResolvedValue([['99', '500']] as never);

      const result = await findVisibleUsersFor(42);

      expect(result[0].latitude).toBe(0);
      expect(result[0].longitude).toBe(0);
    });
  });

  describe('findConnectedFriendsFor', () => {
    it('should return empty array when user has no friendships', async () => {
      mockPrisma.friendship.findMany.mockResolvedValue([]);

      const result = await findConnectedFriendsFor(42);

      expect(result).toEqual([]);
    });

    it('should return friends with active sessions', async () => {
      mockPrisma.friendship.findMany.mockResolvedValue([
        { id: 1, userIdA: 42, userIdB: 99, createdAt: new Date() },
        { id: 2, userIdA: 100, userIdB: 42, createdAt: new Date() },
      ]);

      mockRedis.hgetall
        .mockResolvedValueOnce({ lat: '37.38', lng: '-5.99' } as never)
        .mockResolvedValueOnce({ lat: '37.39', lng: '-6.00' } as never);

      const result = await findConnectedFriendsFor(42);

      expect(result).toHaveLength(2);
      expect(result).toEqual([
        { userId: 99, latitude: 37.38, longitude: -5.99 },
        { userId: 100, latitude: 37.39, longitude: -6.00 },
      ]);
    });

    it('should skip friends without active sessions', async () => {
      mockPrisma.friendship.findMany.mockResolvedValue([
        { id: 1, userIdA: 42, userIdB: 99, createdAt: new Date() },
        { id: 2, userIdA: 42, userIdB: 100, createdAt: new Date() },
      ]);

      mockRedis.hgetall
        .mockResolvedValueOnce({ lat: '37.38', lng: '-5.99' } as never)
        .mockResolvedValueOnce({} as never);

      const result = await findConnectedFriendsFor(42);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ userId: 99, latitude: 37.38, longitude: -5.99 });
    });

    it('should skip friends with invalid lat/lng', async () => {
      mockPrisma.friendship.findMany.mockResolvedValue([
        { id: 1, userIdA: 42, userIdB: 99, createdAt: new Date() },
        { id: 2, userIdA: 42, userIdB: 100, createdAt: new Date() },
      ]);

      mockRedis.hgetall
        .mockResolvedValueOnce({ lat: 'bad', lng: 'bad' } as never)
        .mockResolvedValueOnce({ lat: '37.39', lng: '-6.00' } as never);

      const result = await findConnectedFriendsFor(42);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ userId: 100, latitude: 37.39, longitude: -6.00 });
    });
  });
});
