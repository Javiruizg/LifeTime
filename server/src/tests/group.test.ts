import {
  findCliqueForUser,
  calculateGroupCenter,
  calculateGeohash,
  acquireCreationLock,
  releaseCreationLock,
} from '../features/group/group.engine';
import redis from '../shared/lib/redis';
import { findVisibleUsersFor } from '../features/location/location.engine';

jest.mock('../shared/lib/redis', () => ({
  __esModule: true,
  default: {
    scard: jest.fn(),
    hgetall: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../features/location/location.engine', () => ({
  findVisibleUsersFor: jest.fn(),
}));

const mockRedis = redis as jest.Mocked<typeof redis>;
const mockFindVisibleUsersFor = findVisibleUsersFor as jest.MockedFunction<typeof findVisibleUsersFor>;

describe('Group Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findCliqueForUser', () => {
    it('should return null if user already has a group', async () => {
      mockRedis.scard.mockResolvedValue(1 as never);

      const result = await findCliqueForUser(1);

      expect(result).toBeNull();
      expect(mockRedis.scard).toHaveBeenCalledWith('user:groups:1');
    });

    it('should return null if no visible users', async () => {
      mockRedis.scard.mockResolvedValue(0 as never);
      mockFindVisibleUsersFor.mockResolvedValue([]);
      mockRedis.hgetall.mockResolvedValue({ lat: '40.4168', lng: '-3.7038', range: '2000' });

      const result = await findCliqueForUser(1);

      expect(result).toBeNull();
    });

    it('should return null if only 1 visible user and 2 total', async () => {
      mockRedis.scard.mockResolvedValue(0 as never);
      mockFindVisibleUsersFor.mockResolvedValue([
        { userId: '2', latitude: 40.4170, longitude: -3.7040, distance: 100 },
      ]);
      mockRedis.hgetall.mockResolvedValue({ lat: '40.4168', lng: '-3.7038', range: '2000' });

      const result = await findCliqueForUser(1);

      expect(result).toBeNull();
    });

    it('should return clique of 3 if all mutually visible', async () => {
      mockRedis.scard.mockResolvedValue(0 as never);
      // First call: user 1 sees user 2 and 3 (initial check)
      mockFindVisibleUsersFor.mockResolvedValueOnce([
        { userId: '2', latitude: 40.4170, longitude: -3.7040, distance: 100 },
        { userId: '3', latitude: 40.4165, longitude: -3.7025, distance: 150 },
      ]);
      // Then when checking visibility from user 1 (self): sees 2 and 3
      mockFindVisibleUsersFor.mockResolvedValueOnce([
        { userId: '2', latitude: 40.4170, longitude: -3.7040, distance: 100 },
        { userId: '3', latitude: 40.4165, longitude: -3.7025, distance: 150 },
      ]);
      // Then when checking visibility from user 2: sees 1 and 3
      mockFindVisibleUsersFor.mockResolvedValueOnce([
        { userId: '1', latitude: 40.4168, longitude: -3.7038, distance: 100 },
        { userId: '3', latitude: 40.4165, longitude: -3.7025, distance: 200 },
      ]);
      // Then when checking visibility from user 3: sees 1 and 2
      mockFindVisibleUsersFor.mockResolvedValueOnce([
        { userId: '1', latitude: 40.4168, longitude: -3.7038, distance: 150 },
        { userId: '2', latitude: 40.4170, longitude: -3.7040, distance: 200 },
      ]);
      mockRedis.hgetall.mockResolvedValue({ lat: '40.4168', lng: '-3.7038', range: '2000' });

      const result = await findCliqueForUser(1);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should return null if user has no location session', async () => {
      mockRedis.scard.mockResolvedValue(0 as never);
      mockFindVisibleUsersFor.mockResolvedValue([
        { userId: '2', latitude: 40.4170, longitude: -3.7040, distance: 100 },
        { userId: '3', latitude: 40.4165, longitude: -3.7025, distance: 150 },
      ]);
      mockRedis.hgetall.mockResolvedValue({} as never); // empty session

      const result = await findCliqueForUser(1);

      expect(result).toBeNull();
    });

    it('should return null if not all mutually visible', async () => {
      mockRedis.scard.mockResolvedValue(0 as never);
      // First call: user 1 sees user 2 and 3 (initial check)
      mockFindVisibleUsersFor.mockResolvedValueOnce([
        { userId: '2', latitude: 40.4170, longitude: -3.7040, distance: 100 },
        { userId: '3', latitude: 40.4165, longitude: -3.7025, distance: 150 },
      ]);
      // Then when checking visibility from user 1 (self): sees 2 and 3
      mockFindVisibleUsersFor.mockResolvedValueOnce([
        { userId: '2', latitude: 40.4170, longitude: -3.7040, distance: 100 },
        { userId: '3', latitude: 40.4165, longitude: -3.7025, distance: 150 },
      ]);
      // Then when checking visibility from user 2: only sees 1, NOT 3
      mockFindVisibleUsersFor.mockResolvedValueOnce([
        { userId: '1', latitude: 40.4168, longitude: -3.7038, distance: 100 },
      ]);
      mockRedis.hgetall.mockResolvedValue({ lat: '40.4168', lng: '-3.7038', range: '2000' });

      const result = await findCliqueForUser(1);

      expect(result).toBeNull();
    });
  });

  describe('calculateGroupCenter', () => {
    it('should calculate average of latitudes and longitudes', () => {
      const users = [
        { latitude: 40.4168, longitude: -3.7038 },
        { latitude: 40.4170, longitude: -3.7040 },
        { latitude: 40.4165, longitude: -3.7025 },
      ];

      const result = calculateGroupCenter(users);

      expect(result.lat).toBeCloseTo(40.41677, 5);
      expect(result.lng).toBeCloseTo(-3.70343, 5);
    });
  });

  describe('calculateGeohash', () => {
    it('should round to 3 decimal places', () => {
      const result = calculateGeohash(40.416777, -3.703811);

      expect(result).toBe('40.417_-3.704');
    });
  });

  describe('acquireCreationLock', () => {
    it('should return true if lock is acquired', async () => {
      mockRedis.set.mockResolvedValue('OK' as never);

      const result = await acquireCreationLock('40.416_-3.704');

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'group:creation_lock:40.416_-3.704',
        '1',
        'EX',
        10,
        'NX'
      );
    });

    it('should return false if lock already exists', async () => {
      mockRedis.set.mockResolvedValue(null as never);

      const result = await acquireCreationLock('40.416_-3.704');

      expect(result).toBe(false);
    });
  });

  describe('releaseCreationLock', () => {
    it('should delete the lock key', async () => {
      mockRedis.del.mockResolvedValue(1 as never);

      await releaseCreationLock('40.416_-3.704');

      expect(mockRedis.del).toHaveBeenCalledWith('group:creation_lock:40.416_-3.704');
    });
  });
});
