import {
  createGroupFromClique,
  onUserConnected,
  onUserDisconnected,
  deleteGroup,
  getNearbyGroups,
  joinGroup,
} from '../features/group/group.service';
import { getNearbyGroupsController, joinGroupController } from '../features/group/group.controller';
import { prisma } from '../shared/lib/prisma';
import redis from '../shared/lib/redis';
import { getIO } from '../websocket/socket';
import * as engine from '../features/group/group.engine';
import type { AuthenticatedRequest } from '../shared/types/auth';
import type { Response } from 'express';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockTx = {
  chat: { create: jest.fn() },
  profile: { create: jest.fn() },
  groupChat: { create: jest.fn() },
  chatMember: { create: jest.fn() },
};

jest.mock('../shared/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    chat: { delete: jest.fn() },
    groupChat: { findUnique: jest.fn(), findMany: jest.fn() },
    chatMember: { deleteMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    message: { findFirst: jest.fn(), findMany: jest.fn() },
  },
}));

jest.mock('../shared/lib/redis', () => ({
  __esModule: true,
  default: {
    smembers: jest.fn(),
    srem: jest.fn(),
    scard: jest.fn(),
    sadd: jest.fn(),
    hgetall: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../websocket/socket', () => ({
  getIO: jest.fn(),
}));

jest.mock('../features/group/group.engine', () => ({
  findCliqueForUser: jest.fn(),
  calculateGroupCenter: jest.fn(),
  calculateGeohash: jest.fn(),
  acquireCreationLock: jest.fn(),
  releaseCreationLock: jest.fn(),
}));

const mockPrisma = prisma as any;
const mockRedis = redis as jest.Mocked<typeof redis>;
const mockGetIO = getIO as jest.MockedFunction<typeof getIO>;
const mockEngine = engine as jest.Mocked<typeof engine>;

const mockIo = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
};

// ---------------------------------------------------------------------------
// Controller helpers
// ---------------------------------------------------------------------------
function mockReq(userId: number, query: any = {}, params: any = {}, body: any = {}): AuthenticatedRequest {
  return { user: { id: userId }, query, params, body } as AuthenticatedRequest;
}

function mockRes(): Response {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

// ---------------------------------------------------------------------------
// Tests: Group Service
// ---------------------------------------------------------------------------
describe('Group Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));
    mockGetIO.mockReturnValue(mockIo as any);
  });

  // ===========================
  // createGroupFromClique
  // ===========================
  describe('createGroupFromClique', () => {
    beforeEach(() => {
      mockTx.chat.create.mockResolvedValue({ id: 10 });
      mockTx.profile.create.mockResolvedValue({ id: 20, name: 'Group chat', imageUrl: '/defaults/default-group.png' });
      mockTx.groupChat.create.mockResolvedValue({ chatId: 10, latitude: 40.0, longitude: -3.7, radius: 2000 });
      mockRedis.sadd.mockResolvedValue(1 as never);
    });

    it('creates chat, profile, groupChat and members in a transaction', async () => {
      await createGroupFromClique([1, 2, 3], 40.0, -3.7, 1);

      expect(mockTx.chat.create).toHaveBeenCalledWith({ data: {} });
      expect(mockTx.profile.create).toHaveBeenCalledWith({
        data: { userId: null, name: 'Group chat', message: '', imageUrl: '/defaults/default-group.png' },
      });
      expect(mockTx.groupChat.create).toHaveBeenCalledWith({
        data: { chatId: 10, profileId: 20, createdById: 1, latitude: 40.0, longitude: -3.7, radius: 2000 },
      });
      expect(mockTx.chatMember.create).toHaveBeenCalledTimes(3);
    });

    it('returns the GroupCreatedPayload', async () => {
      const result = await createGroupFromClique([1, 2, 3], 40.0, -3.7, 1);

      expect(result).toEqual({
        chatId: 10,
        name: 'Group chat',
        latitude: 40.0,
        longitude: -3.7,
        imageUrl: '/defaults/default-group.png',
        members: [1, 2, 3],
      });
    });

    it('syncs Redis flags for all members', async () => {
      await createGroupFromClique([1, 2, 3], 40.0, -3.7, 1);

      expect(mockRedis.sadd).toHaveBeenCalledWith('user:groups:1', '10');
      expect(mockRedis.sadd).toHaveBeenCalledWith('user:groups:2', '10');
      expect(mockRedis.sadd).toHaveBeenCalledWith('user:groups:3', '10');
      expect(mockRedis.sadd).toHaveBeenCalledWith('group:members:10', '1');
      expect(mockRedis.sadd).toHaveBeenCalledWith('group:members:10', '2');
      expect(mockRedis.sadd).toHaveBeenCalledWith('group:members:10', '3');
      expect(mockRedis.sadd).toHaveBeenCalledTimes(6);
    });

    it('emits group:created to each member via socket', async () => {
      await createGroupFromClique([1, 2, 3], 40.0, -3.7, 1);

      expect(mockIo.to).toHaveBeenCalledWith('user:1');
      expect(mockIo.to).toHaveBeenCalledWith('user:2');
      expect(mockIo.to).toHaveBeenCalledWith('user:3');
      expect(mockIo.emit).toHaveBeenCalledWith('group:created', expect.any(Object));
      expect(mockIo.emit).toHaveBeenCalledTimes(3);
    });

    it('handles socket error gracefully and still returns result', async () => {
      mockGetIO.mockImplementation(() => { throw new Error('Socket.IO not initialized'); });

      const result = await createGroupFromClique([1, 2], 40.0, -3.7, 1);

      expect(result.chatId).toBe(10);
    });
  });

  // ===========================
  // onUserConnected
  // ===========================
  describe('onUserConnected', () => {
    it('returns null if user already has a valid group', async () => {
      mockRedis.smembers.mockResolvedValue(['1'] as never);
      mockPrisma.groupChat.findUnique.mockResolvedValue({ id: 1 });

      const result = await onUserConnected(1);

      expect(result).toBeNull();
    });

    it('cleans up orphaned groups and continues to clique detection', async () => {
      mockRedis.smembers.mockResolvedValue(['1'] as never);
      mockPrisma.groupChat.findUnique.mockResolvedValue(null); // orphaned
      mockRedis.srem.mockResolvedValue(1 as never);
      mockEngine.findCliqueForUser.mockResolvedValue([1, 2, 3]);
      mockRedis.hgetall.mockResolvedValue({ lat: '40.0', lng: '-3.7' });
      mockEngine.calculateGroupCenter.mockReturnValue({ lat: 40.0, lng: -3.7 });
      mockEngine.calculateGeohash.mockReturnValue('40.0_-3.7');
      mockEngine.acquireCreationLock.mockResolvedValue(true);
      mockRedis.scard.mockResolvedValue(0 as never); // double-check

      mockTx.chat.create.mockResolvedValue({ id: 10 });
      mockTx.profile.create.mockResolvedValue({ id: 20, name: 'Group chat', imageUrl: '/defaults/default-group.png' });
      mockTx.groupChat.create.mockResolvedValue({ chatId: 10, latitude: 40.0, longitude: -3.7, radius: 2000 });
      mockRedis.sadd.mockResolvedValue(1 as never);

      const result = await onUserConnected(1);

      expect(mockRedis.srem).toHaveBeenCalledWith('user:groups:1', '1');
      expect(mockRedis.srem).toHaveBeenCalledWith('group:members:1', '1');
      expect(mockEngine.findCliqueForUser).toHaveBeenCalledWith(1);
      expect(result).not.toBeNull();
      expect(result!.chatId).toBe(10);
    });

    it('returns null if all groups are orphaned but user is left with a still-valid group', async () => {
      mockRedis.smembers.mockResolvedValue(['1', '2'] as never);
      mockPrisma.groupChat.findUnique
        .mockResolvedValueOnce(null) // chat 1 orphaned
        .mockResolvedValueOnce({ id: 2 }); // chat 2 still valid
      mockRedis.srem.mockResolvedValue(1 as never);

      const result = await onUserConnected(1);

      expect(result).toBeNull();
      expect(mockRedis.srem).toHaveBeenCalledTimes(2); // both user:groups and group:members for chatId 1
      expect(mockEngine.findCliqueForUser).not.toHaveBeenCalled();
    });

    it('returns null if no clique is found', async () => {
      mockRedis.smembers.mockResolvedValue([] as never);
      mockEngine.findCliqueForUser.mockResolvedValue(null);

      const result = await onUserConnected(1);

      expect(result).toBeNull();
    });

    it('returns null if clique size < 3', async () => {
      mockRedis.smembers.mockResolvedValue([] as never);
      mockEngine.findCliqueForUser.mockResolvedValue([1, 2]);

      const result = await onUserConnected(1);

      expect(result).toBeNull();
    });

    it('returns null if lock cannot be acquired', async () => {
      mockRedis.smembers.mockResolvedValue([] as never);
      mockEngine.findCliqueForUser.mockResolvedValue([1, 2, 3]);
      mockRedis.hgetall.mockResolvedValue({ lat: '40.0', lng: '-3.7' });
      mockEngine.calculateGroupCenter.mockReturnValue({ lat: 40.0, lng: -3.7 });
      mockEngine.calculateGeohash.mockReturnValue('40.0_-3.7');
      mockEngine.acquireCreationLock.mockResolvedValue(false);

      const result = await onUserConnected(1);

      expect(result).toBeNull();
      expect(mockEngine.releaseCreationLock).not.toHaveBeenCalled();
    });

    it('returns null if a clique member joined a group while waiting for lock', async () => {
      mockRedis.smembers.mockResolvedValue([] as never);
      mockEngine.findCliqueForUser.mockResolvedValue([1, 2, 3]);
      mockRedis.hgetall.mockResolvedValue({ lat: '40.0', lng: '-3.7' });
      mockEngine.calculateGroupCenter.mockReturnValue({ lat: 40.0, lng: -3.7 });
      mockEngine.calculateGeohash.mockReturnValue('40.0_-3.7');
      mockEngine.acquireCreationLock.mockResolvedValue(true);
      mockRedis.scard.mockResolvedValue(1 as never); // double-check fails for one member
      mockEngine.releaseCreationLock.mockResolvedValue();

      const result = await onUserConnected(1);

      expect(result).toBeNull();
      expect(mockEngine.releaseCreationLock).toHaveBeenCalledWith('40.0_-3.7');
    });

    it('successfully creates group when all checks pass', async () => {
      mockRedis.smembers.mockResolvedValue([] as never);
      mockEngine.findCliqueForUser.mockResolvedValue([1, 2, 3]);
      mockRedis.hgetall.mockResolvedValue({ lat: '40.0', lng: '-3.7' });
      mockEngine.calculateGroupCenter.mockReturnValue({ lat: 40.0, lng: -3.7 });
      mockEngine.calculateGeohash.mockReturnValue('40.0_-3.7');
      mockEngine.acquireCreationLock.mockResolvedValue(true);
      mockRedis.scard.mockResolvedValue(0 as never);
      mockEngine.releaseCreationLock.mockResolvedValue();

      mockTx.chat.create.mockResolvedValue({ id: 10 });
      mockTx.profile.create.mockResolvedValue({ id: 20, name: 'Group chat', imageUrl: '/defaults/default-group.png' });
      mockTx.groupChat.create.mockResolvedValue({ chatId: 10, latitude: 40.0, longitude: -3.7, radius: 2000 });
      mockRedis.sadd.mockResolvedValue(1 as never);

      const result = await onUserConnected(1);

      expect(result).not.toBeNull();
      expect(result!.chatId).toBe(10);
      expect(mockEngine.releaseCreationLock).toHaveBeenCalledWith('40.0_-3.7');
    });

    it('returns null if locations are NaN for clique members', async () => {
      mockRedis.smembers.mockResolvedValue([] as never);
      mockEngine.findCliqueForUser.mockResolvedValue([1, 2, 3]);
      mockRedis.hgetall
        .mockResolvedValueOnce({ lat: '40.0', lng: '-3.7' })
        .mockResolvedValueOnce({ lat: 'invalid', lng: '-3.7' })
        .mockResolvedValueOnce({ lat: '40.0', lng: '-3.7' });

      const result = await onUserConnected(1);

      expect(result).toBeNull(); // only 2 valid locations < 3
    });
  });

  // ===========================
  // onUserDisconnected
  // ===========================
  describe('onUserDisconnected', () => {
    it('clears user group set when user has no groups', async () => {
      mockRedis.smembers.mockResolvedValue([] as never);

      await onUserDisconnected(1);

      expect(mockRedis.del).toHaveBeenCalledWith('user:groups:1');
      expect(mockPrisma.chatMember.deleteMany).not.toHaveBeenCalled();
    });

    it('removes user from group and does not delete group when >= 3 members remain', async () => {
      mockRedis.smembers.mockResolvedValue(['5'] as never);
      mockPrisma.chatMember.deleteMany.mockResolvedValue({ count: 1 });
      mockRedis.srem.mockResolvedValue(1 as never);
      mockRedis.scard.mockResolvedValue(5 as never); // 5 remaining
      mockRedis.del.mockResolvedValue(1 as never);

      await onUserDisconnected(1);

      expect(mockPrisma.chatMember.deleteMany).toHaveBeenCalledWith({ where: { userId: 1, chatId: 5 } });
      expect(mockRedis.srem).toHaveBeenCalledWith('group:members:5', '1');
      expect(mockRedis.del).toHaveBeenCalledWith('user:groups:1');
    });

    it('deletes group when remaining members drop to 2', async () => {
      mockRedis.smembers
        .mockResolvedValueOnce(['5'] as never) // user's groups
        .mockResolvedValueOnce(['2', '3'] as never); // deleteGroup: remaining members

      mockPrisma.chatMember.deleteMany.mockResolvedValue({ count: 1 });
      mockRedis.srem.mockResolvedValue(1 as never);
      mockRedis.scard.mockResolvedValue(2 as never); // underflow!
      mockRedis.del.mockResolvedValue(1 as never);
      mockPrisma.chat.delete.mockResolvedValue({ id: 5 });

      await onUserDisconnected(1);

      expect(mockIo.emit).toHaveBeenCalledWith('group:deleted', { chatId: 5, reason: 'underflow' });
      expect(mockRedis.del).toHaveBeenCalledWith('group:members:5');
      expect(mockPrisma.chat.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    });

    it('handles Prisma error gracefully when chatMember no longer exists', async () => {
      mockRedis.smembers.mockResolvedValue(['5'] as never);
      mockPrisma.chatMember.deleteMany.mockRejectedValue(new Error('Record not found'));
      mockRedis.srem.mockResolvedValue(1 as never);
      mockRedis.scard.mockResolvedValue(5 as never);
      mockRedis.del.mockResolvedValue(1 as never);

      await expect(onUserDisconnected(1)).resolves.not.toThrow();
    });
  });

  // ===========================
  // deleteGroup
  // ===========================
  describe('deleteGroup', () => {
    it('notifies chat room and each member, cleans Redis, and cascade deletes chat', async () => {
      mockRedis.smembers.mockResolvedValue(['2', '3'] as never);
      mockRedis.srem.mockResolvedValue(1 as never);
      mockRedis.del.mockResolvedValue(1 as never);
      mockPrisma.chat.delete.mockResolvedValue({ id: 5 });

      await deleteGroup(5);

      expect(mockIo.to).toHaveBeenCalledWith('chat:5');
      expect(mockIo.to).toHaveBeenCalledWith('user:2');
      expect(mockIo.to).toHaveBeenCalledWith('user:3');
      expect(mockIo.emit).toHaveBeenCalledWith('group:deleted', { chatId: 5, reason: 'underflow' });
      expect(mockRedis.srem).toHaveBeenCalledWith('user:groups:2', '5');
      expect(mockRedis.srem).toHaveBeenCalledWith('user:groups:3', '5');
      expect(mockRedis.del).toHaveBeenCalledWith('group:members:5');
      expect(mockPrisma.chat.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    });

    it('handles Socket.IO not initialized gracefully', async () => {
      mockGetIO.mockImplementation(() => { throw new Error('Socket.IO not initialized'); });
      mockRedis.smembers.mockResolvedValue(['2'] as never);
      mockRedis.srem.mockResolvedValue(1 as never);
      mockRedis.del.mockResolvedValue(1 as never);
      mockPrisma.chat.delete.mockResolvedValue({ id: 5 });

      await deleteGroup(5);

      // console.error called but function completes
      expect(mockPrisma.chat.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    });

    it('handles chat not found error gracefully', async () => {
      mockRedis.smembers.mockResolvedValue([] as never);
      mockRedis.del.mockResolvedValue(1 as never);
      mockPrisma.chat.delete.mockRejectedValue(new Error('Record not found'));

      await deleteGroup(5);

      // Should not throw
      expect(mockPrisma.chat.delete).toHaveBeenCalled();
    });
  });

  // ===========================
  // getNearbyGroups
  // ===========================
  describe('getNearbyGroups', () => {
    it('returns groups within the given radius', async () => {
      mockPrisma.groupChat.findMany.mockResolvedValue([
        {
          chatId: 1,
          latitude: 40.4168,
          longitude: -3.7038,
          profile: { name: 'Group A', imageUrl: null },
          chat: { _count: { members: 3 } },
        },
      ]);
      mockPrisma.message.findMany.mockResolvedValue([]); // no unread

      const result = await getNearbyGroups(40.4168, -3.7038, 2000, 99);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        chatId: 1,
        name: 'Group A',
        latitude: 40.4168,
        longitude: -3.7038,
        imageUrl: null,
        membersCount: 3,
        hasUnread: false,
      });
    });

    it('filters out groups beyond the radius', async () => {
      mockPrisma.groupChat.findMany.mockResolvedValue([
        {
          chatId: 1,
          latitude: 40.4168,
          longitude: -3.7038,
          profile: { name: 'Group nearby', imageUrl: null },
          chat: { _count: { members: 1 } },
        },
        {
          chatId: 2,
          latitude: 41.0,
          longitude: -4.0,
          profile: { name: 'Group far', imageUrl: null },
          chat: { _count: { members: 1 } },
        },
      ]);
      mockPrisma.message.findMany.mockResolvedValue([]);

      const result = await getNearbyGroups(40.4168, -3.7038, 2000, 99);

      expect(result).toHaveLength(1);
      expect(result[0].chatId).toBe(1);
    });

    it('reports hasUnread as true when there are unseen messages', async () => {
      mockPrisma.groupChat.findMany.mockResolvedValue([
        {
          chatId: 1,
          latitude: 40.4168,
          longitude: -3.7038,
          profile: { name: 'Group', imageUrl: '/img.png' },
          chat: { _count: { members: 1 } },
        },
      ]);
      mockPrisma.message.findMany.mockResolvedValue([{ chatId: 1 }]);

      const result = await getNearbyGroups(40.4168, -3.7038, 2000, 99);

      expect(result[0].hasUnread).toBe(true);
    });

    it('returns empty array when no groups exist', async () => {
      mockPrisma.groupChat.findMany.mockResolvedValue([]);

      const result = await getNearbyGroups(40.4168, -3.7038, 2000, 99);

      expect(result).toEqual([]);
    });
  });

  // ===========================
  // joinGroup
  // ===========================
  describe('joinGroup', () => {
    it('throws if user has no active location session', async () => {
      mockRedis.hgetall.mockResolvedValue({} as never);

      await expect(joinGroup(5, 1)).rejects.toThrow('User does not have an active location session');
    });

    it('throws if user location is NaN', async () => {
      mockRedis.hgetall.mockResolvedValue({ lat: 'invalid', lng: '-3.7' } as never);

      await expect(joinGroup(5, 1)).rejects.toThrow('Invalid user location');
    });

    it('throws if group does not exist', async () => {
      mockRedis.hgetall.mockResolvedValue({ lat: '40.0', lng: '-3.7' } as never);
      mockPrisma.groupChat.findUnique.mockResolvedValue(null);

      await expect(joinGroup(5, 1)).rejects.toThrow('Group not found');
    });

    it('throws if user is too far from the group', async () => {
      mockRedis.hgetall.mockResolvedValue({ lat: '41.0', lng: '-4.0' } as never); // ~70+ km away
      mockPrisma.groupChat.findUnique.mockResolvedValue({
        chatId: 5,
        latitude: 40.4168,
        longitude: -3.7038,
        radius: 1000,
      });

      await expect(joinGroup(5, 1)).rejects.toThrow('User is too far from the group');
    });

    it('syncs Redis and returns early if already a member', async () => {
      mockRedis.hgetall.mockResolvedValue({ lat: '40.4168', lng: '-3.7038' } as never);
      mockPrisma.groupChat.findUnique.mockResolvedValue({
        chatId: 5,
        latitude: 40.4168,
        longitude: -3.7038,
        radius: 2000,
      });
      mockPrisma.chatMember.findUnique.mockResolvedValue({ userId: 1, chatId: 5 });
      mockRedis.sadd.mockResolvedValue(1 as never);

      await joinGroup(5, 1);

      expect(mockRedis.sadd).toHaveBeenCalledWith('user:groups:1', '5');
      expect(mockRedis.sadd).toHaveBeenCalledWith('group:members:5', '1');
      expect(mockPrisma.chatMember.create).not.toHaveBeenCalled();
    });

    it('creates membership and emits group:joined on successful join', async () => {
      mockRedis.hgetall.mockResolvedValue({ lat: '40.4168', lng: '-3.7038' } as never);
      mockPrisma.groupChat.findUnique.mockResolvedValue({
        chatId: 5,
        latitude: 40.4168,
        longitude: -3.7038,
        radius: 2000,
      });
      mockPrisma.chatMember.findUnique.mockResolvedValue(null);
      mockRedis.sadd.mockResolvedValue(1 as never);
      mockPrisma.chatMember.create.mockResolvedValue({ userId: 1, chatId: 5, role: 'MEMBER' });

      await joinGroup(5, 1);

      expect(mockPrisma.chatMember.create).toHaveBeenCalledWith({
        data: { userId: 1, chatId: 5, role: 'MEMBER' },
      });
      expect(mockRedis.sadd).toHaveBeenCalledWith('user:groups:1', '5');
      expect(mockRedis.sadd).toHaveBeenCalledWith('group:members:5', '1');
      expect(mockIo.to).toHaveBeenCalledWith('chat:5');
      expect(mockIo.emit).toHaveBeenCalledWith('group:joined', { chatId: 5, userId: 1 });
    });

    it('handles socket error gracefully when joining', async () => {
      mockGetIO.mockImplementation(() => { throw new Error('Socket.IO not initialized'); });
      mockRedis.hgetall.mockResolvedValue({ lat: '40.4168', lng: '-3.7038' } as never);
      mockPrisma.groupChat.findUnique.mockResolvedValue({
        chatId: 5,
        latitude: 40.4168,
        longitude: -3.7038,
        radius: 2000,
      });
      mockPrisma.chatMember.findUnique.mockResolvedValue(null);
      mockRedis.sadd.mockResolvedValue(1 as never);
      mockPrisma.chatMember.create.mockResolvedValue({ userId: 1, chatId: 5, role: 'MEMBER' });

      await expect(joinGroup(5, 1)).resolves.not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Group Controller
// ---------------------------------------------------------------------------
describe('Group Controller', () => {
  let mockGetNearbyGroups: jest.SpyInstance;
  let mockJoinGroup: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNearbyGroups = jest.spyOn(require('../features/group/group.service'), 'getNearbyGroups');
    mockJoinGroup = jest.spyOn(require('../features/group/group.service'), 'joinGroup');
  });

  // ===========================
  // getNearbyGroupsController
  // ===========================
  describe('getNearbyGroupsController', () => {
    it('returns 400 for invalid query parameters', async () => {
      const req = mockReq(1, { lat: 'abc', lng: '-3.7' });
      const res = mockRes();

      await getNearbyGroupsController(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid query parameters' }));
    });

    it('returns 400 when lat is out of range', async () => {
      const req = mockReq(1, { lat: '91', lng: '0', radius: '2000' });
      const res = mockRes();

      await getNearbyGroupsController(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 401 when user is not authenticated', async () => {
      const req = { query: { lat: '40', lng: '-3', radius: '2000' } } as any;
      const res = mockRes();

      await getNearbyGroupsController(req, res as any);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 200 with groups on success', async () => {
      const req = mockReq(1, { lat: '40', lng: '-3', radius: '2000' });
      const res = mockRes();
      mockGetNearbyGroups.mockResolvedValue([{ chatId: 5, name: 'Test', latitude: 40, longitude: -3, imageUrl: null, membersCount: 3, hasUnread: false }]);

      await getNearbyGroupsController(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, groups: expect.any(Array) });
    });

    it('returns 500 on service error', async () => {
      const req = mockReq(1, { lat: '40', lng: '-3', radius: '2000' });
      const res = mockRes();
      mockGetNearbyGroups.mockRejectedValue(new Error('DB down'));

      await getNearbyGroupsController(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ===========================
  // joinGroupController
  // ===========================
  describe('joinGroupController', () => {
    it('returns 400 for invalid chatId parameter', async () => {
      const req = mockReq(1, {}, { chatId: 'abc' });
      const res = mockRes();

      await joinGroupController(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid parameters' }));
    });

    it('returns 400 for negative chatId', async () => {
      const req = mockReq(1, {}, { chatId: '-5' });
      const res = mockRes();

      await joinGroupController(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 401 when user is not authenticated', async () => {
      const req = { params: { chatId: '5' } } as any;
      const res = mockRes();

      await joinGroupController(req, res as any);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 403 when user has no active location session', async () => {
      const req = mockReq(1, {}, { chatId: '5' });
      const res = mockRes();
      mockJoinGroup.mockRejectedValue(new Error('User does not have an active location session'));

      await joinGroupController(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Active location session required' }));
    });

    it('returns 403 when user is too far from the group', async () => {
      const req = mockReq(1, {}, { chatId: '5' });
      const res = mockRes();
      mockJoinGroup.mockRejectedValue(new Error('User is too far from the group'));

      await joinGroupController(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'You are too far from this group' }));
    });

    it('returns 404 when group is not found', async () => {
      const req = mockReq(1, {}, { chatId: '5' });
      const res = mockRes();
      mockJoinGroup.mockRejectedValue(new Error('Group not found'));

      await joinGroupController(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Group not found' }));
    });

    it('returns 200 on successful join', async () => {
      const req = mockReq(1, {}, { chatId: '5' });
      const res = mockRes();
      mockJoinGroup.mockResolvedValue(undefined);

      await joinGroupController(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Joined group successfully' });
    });

    it('returns 500 on generic service error', async () => {
      const req = mockReq(1, {}, { chatId: '5' });
      const res = mockRes();
      mockJoinGroup.mockRejectedValue(new Error('Something unexpected'));

      await joinGroupController(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
