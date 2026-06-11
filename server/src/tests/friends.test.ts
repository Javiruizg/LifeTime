import request from 'supertest';
import app from '../app';
import { prisma } from '../shared/lib/prisma';
import redis from '../shared/lib/redis';
import { hashToken } from '../shared/lib/hash';

const DEVICE_A = 'friends-test-device-a';
const DEVICE_B = 'friends-test-device-b';
const DEVICE_C = 'friends-test-device-c';

async function createUser(deviceId: string): Promise<{ token: string; userId: number }> {
  const response = await request(app)
    .post('/api/auth/device')
    .send({ deviceId });

  return {
    token: response.body.accessToken,
    userId: response.body.userId,
  };
}

async function cleanupUsers() {
  const deviceIds = [DEVICE_A, DEVICE_B, DEVICE_C].map(hashToken);
  const users = await prisma.user.findMany({
    where: { deviceId: { in: deviceIds } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [{ senderId: { in: userIds } }, { receiverId: { in: userIds } }],
      },
    });
    await prisma.friendship.deleteMany({
      where: {
        OR: [{ userIdA: { in: userIds } }, { userIdB: { in: userIds } }],
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }
}

describe('Friends endpoints', () => {
  let userA: { token: string; userId: number };
  let userB: { token: string; userId: number };
  let userC: { token: string; userId: number };

  beforeEach(async () => {
    await cleanupUsers();
    userA = await createUser(DEVICE_A);
    userB = await createUser(DEVICE_B);
    userC = await createUser(DEVICE_C);
  });

  afterAll(async () => {
    await cleanupUsers();
    await prisma.$disconnect();
  });

  describe('POST /api/friends/request', () => {
    it('should send a friend request successfully', async () => {
      const response = await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 409 if request already pending', async () => {
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      const response = await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      expect(response.status).toBe(409);
    });

    it('should return 409 if already friends', async () => {
      // A sends to B
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      // B accepts
      const requests = await request(app)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${userB.token}`);

      await request(app)
        .post(`/api/friends/accept/${requests.body[0].id}`)
        .set('Authorization', `Bearer ${userB.token}`);

      // A tries to send again
      const response = await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      expect(response.status).toBe(409);
    });

    it('should return 409 if request was rejected', async () => {
      // A sends to B
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      // B rejects
      const requests = await request(app)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${userB.token}`);

      await request(app)
        .post(`/api/friends/reject/${requests.body[0].id}`)
        .set('Authorization', `Bearer ${userB.token}`);

      // A tries to send again
      const response = await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      expect(response.status).toBe(409);
    });

    it('should auto-accept if reverse request exists', async () => {
      // A sends to B
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      // B sends to A (should auto-accept)
      const response = await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ receiverId: userA.userId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify both are friends
      const friendsA = await request(app)
        .get('/api/friends')
        .set('Authorization', `Bearer ${userA.token}`);
      expect(friendsA.body).toHaveLength(1);
      expect(friendsA.body[0].userId).toBe(userB.userId);

      const friendsB = await request(app)
        .get('/api/friends')
        .set('Authorization', `Bearer ${userB.token}`);
      expect(friendsB.body).toHaveLength(1);
      expect(friendsB.body[0].userId).toBe(userA.userId);
    });
  });

  describe('DELETE /api/friends/request/:receiverId', () => {
    it('should cancel a pending request', async () => {
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      const response = await request(app)
        .delete(`/api/friends/request/${userB.userId}`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 404 if no pending request', async () => {
      const response = await request(app)
        .delete(`/api/friends/request/${userB.userId}`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/friends/accept/:requestId', () => {
    it('should accept a friend request', async () => {
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      const requests = await request(app)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${userB.token}`);

      const response = await request(app)
        .post(`/api/friends/accept/${requests.body[0].id}`)
        .set('Authorization', `Bearer ${userB.token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 404 if request not found', async () => {
      const response = await request(app)
        .post('/api/friends/accept/99999')
        .set('Authorization', `Bearer ${userB.token}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/friends/reject/:requestId', () => {
    it('should reject a friend request', async () => {
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      const requests = await request(app)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${userB.token}`);

      const response = await request(app)
        .post(`/api/friends/reject/${requests.body[0].id}`)
        .set('Authorization', `Bearer ${userB.token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 404 if request not found', async () => {
      const response = await request(app)
        .post('/api/friends/reject/99999')
        .set('Authorization', `Bearer ${userB.token}`);

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/friends/:friendId', () => {
    it('should remove a friendship', async () => {
      // Create friendship
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      const requests = await request(app)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${userB.token}`);

      await request(app)
        .post(`/api/friends/accept/${requests.body[0].id}`)
        .set('Authorization', `Bearer ${userB.token}`);

      // Remove friendship
      const response = await request(app)
        .delete(`/api/friends/${userB.userId}`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify both have no friends
      const friendsA = await request(app)
        .get('/api/friends')
        .set('Authorization', `Bearer ${userA.token}`);
      expect(friendsA.body).toHaveLength(0);

      const friendsB = await request(app)
        .get('/api/friends')
        .set('Authorization', `Bearer ${userB.token}`);
      expect(friendsB.body).toHaveLength(0);
    });
  });

  describe('GET /api/friends', () => {
    it('should return friends list with isOnline status', async () => {
      // Create friendship
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      const requests = await request(app)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${userB.token}`);

      await request(app)
        .post(`/api/friends/accept/${requests.body[0].id}`)
        .set('Authorization', `Bearer ${userB.token}`);

      // Simulate B online
      await redis.hset(`location:session:${userB.userId}`, { range: '1000', connectedAt: '1' });
      await redis.expire(`location:session:${userB.userId}`, 3600);

      const response = await request(app)
        .get('/api/friends')
        .set('Authorization', `Bearer ${userA.token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].userId).toBe(userB.userId);
      expect(response.body[0]).toHaveProperty('profile');
      expect(response.body[0]).toHaveProperty('isOnline');
      expect(response.body[0].isOnline).toBe(true);

      // Cleanup redis
      await redis.del(`location:session:${userB.userId}`);
    });

    it('should return empty array if no friends', async () => {
      const response = await request(app)
        .get('/api/friends')
        .set('Authorization', `Bearer ${userA.token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(0);
    });
  });

  describe('GET /api/friends/requests', () => {
    it('should return received pending requests', async () => {
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userC.token}`)
        .send({ receiverId: userB.userId });

      const response = await request(app)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${userB.token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].senderId).toBe(userC.userId);
      expect(response.body[1].senderId).toBe(userA.userId);
    });

    it('should return empty array if no requests', async () => {
      const response = await request(app)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${userA.token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(0);
    });
  });

  describe('GET /api/friends/status/:userId', () => {
    it('should return none for strangers', async () => {
      const response = await request(app)
        .get(`/api/friends/status/${userB.userId}`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('none');
    });

    it('should return pending_sent if request sent', async () => {
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      const response = await request(app)
        .get(`/api/friends/status/${userB.userId}`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('pending_sent');
    });

    it('should return pending_received if request received', async () => {
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      const response = await request(app)
        .get(`/api/friends/status/${userA.userId}`)
        .set('Authorization', `Bearer ${userB.token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('pending_received');
      expect(response.body).toHaveProperty('requestId');
    });

    it('should return friends if accepted', async () => {
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      const requests = await request(app)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${userB.token}`);

      await request(app)
        .post(`/api/friends/accept/${requests.body[0].id}`)
        .set('Authorization', `Bearer ${userB.token}`);

      const response = await request(app)
        .get(`/api/friends/status/${userB.userId}`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('friends');
    });

    it('should return rejected if request was rejected', async () => {
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      const requests = await request(app)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${userB.token}`);

      await request(app)
        .post(`/api/friends/reject/${requests.body[0].id}`)
        .set('Authorization', `Bearer ${userB.token}`);

      const response = await request(app)
        .get(`/api/friends/status/${userB.userId}`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('rejected');
    });
  });

  describe('Reversible rejection', () => {
    it('should allow sender to re-send after being rejected', async () => {
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      const requests = await request(app)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${userB.token}`);

      await request(app)
        .post(`/api/friends/reject/${requests.body[0].id}`)
        .set('Authorization', `Bearer ${userB.token}`);

      const response = await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ receiverId: userA.userId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should block original sender after being rejected', async () => {
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      const requests = await request(app)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${userB.token}`);

      await request(app)
        .post(`/api/friends/reject/${requests.body[0].id}`)
        .set('Authorization', `Bearer ${userB.token}`);

      const response = await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      expect(response.status).toBe(409);
    });

    it('should clean up rejected request when auto-accepting', async () => {
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      const response = await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ receiverId: userA.userId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const friendsA = await request(app)
        .get('/api/friends')
        .set('Authorization', `Bearer ${userA.token}`);
      expect(friendsA.body).toHaveLength(1);
      expect(friendsA.body[0].userId).toBe(userB.userId);

      const pendingRequests = await prisma.friendRequest.findMany({
        where: {
          OR: [
            { senderId: userA.userId, receiverId: userB.userId },
            { senderId: userB.userId, receiverId: userA.userId },
          ],
        },
      });
      expect(pendingRequests).toHaveLength(0);
    });

    it('should clean up rejected request on manual accept', async () => {
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      const requestsBtoA = await request(app)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${userB.token}`);

      await request(app)
        .post(`/api/friends/reject/${requestsBtoA.body[0].id}`)
        .set('Authorization', `Bearer ${userB.token}`);

      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ receiverId: userA.userId });

      const requestsAtoB = await request(app)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${userA.token}`);

      await request(app)
        .post(`/api/friends/accept/${requestsAtoB.body[0].id}`)
        .set('Authorization', `Bearer ${userA.token}`);

      const friendsA = await request(app)
        .get('/api/friends')
        .set('Authorization', `Bearer ${userA.token}`);
      expect(friendsA.body).toHaveLength(1);
      expect(friendsA.body[0].userId).toBe(userB.userId);

      const pendingRequests = await prisma.friendRequest.findMany({
        where: {
          OR: [
            { senderId: userA.userId, receiverId: userB.userId },
            { senderId: userB.userId, receiverId: userA.userId },
          ],
        },
      });
      expect(pendingRequests).toHaveLength(0);
    });

    it('should return correct status after rejection reversal', async () => {
      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ receiverId: userB.userId });

      const requests = await request(app)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${userB.token}`);

      await request(app)
        .post(`/api/friends/reject/${requests.body[0].id}`)
        .set('Authorization', `Bearer ${userB.token}`);

      await request(app)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ receiverId: userA.userId });

      const response = await request(app)
        .get(`/api/friends/status/${userB.userId}`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('pending_received');
    });
  });
});
