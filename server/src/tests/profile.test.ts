import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { prisma } from '../shared/lib/prisma';
import { hashToken } from '../shared/lib/hash';

describe('Profile endpoints', () => {
  const testDeviceId = 'profile-test-device';
  const secondDeviceId = 'profile-test-device-2';
  const JWT_SECRET = process.env.JWT_SECRET!;

  afterAll(async () => {
    await prisma.profile.deleteMany({
      where: {
        user: {
          deviceId: { in: [hashToken(testDeviceId), hashToken(secondDeviceId)] },
        },
      },
    });
    await prisma.user.deleteMany({
      where: { deviceId: { in: [hashToken(testDeviceId), hashToken(secondDeviceId)] } },
    });
    await prisma.$disconnect();
  });

  describe('GET /api/profile/me', () => {
    describe('authentication', () => {
      it('should return 401 when no Authorization header is present', async () => {
        const response = await request(app).get('/api/profile/me');

        expect(response.status).toBe(401);
        expect(response.body.error).toMatch(/missing or invalid token/i);
      });

      it('should return 401 when using a refresh token instead of access token', async () => {
        const refreshToken = jwt.sign(
          { userId: 1, type: 'refresh', jti: 'test-jti' },
          JWT_SECRET
        );

        const response = await request(app)
          .get('/api/profile/me')
          .set('Authorization', `Bearer ${refreshToken}`);

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Unauthorized: invalid token type');
      });

      it('should return 401 for a completely malformed token string', async () => {
        const response = await request(app)
          .get('/api/profile/me')
          .set('Authorization', 'Bearer not.a.valid-jwt');

        expect(response.status).toBe(401);
      });
    });

    describe('successful retrieval', () => {
      it('should return 200 with the full profile for an authenticated user', async () => {
        const loginRes = await request(app)
          .post('/api/auth/device')
          .send({ deviceId: testDeviceId });

        const accessToken = loginRes.body.accessToken;
        const userId = loginRes.body.userId;

        const response = await request(app)
          .get('/api/profile/me')
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          id: expect.any(Number),
          userId,
          name: 'Unnamed',
          message: '',
          imageUrl: '/defaults/default-avatar.png',
        });
      });
    });

    describe('edge cases', () => {
      it('should return 404 when the user exists but has no profile record', async () => {
        // Create a user without a profile via direct DB manipulation
        const user = await prisma.user.create({
          data: { deviceId: hashToken(secondDeviceId), refreshToken: '' },
        });
        const accessToken = jwt.sign({ userId: user.id, type: 'access' }, JWT_SECRET);

        const response = await request(app)
          .get('/api/profile/me')
          .set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Profile not found');
      });
    });
  });

  describe('PUT /api/profile/me', () => {
    describe('authentication', () => {
      it('should return 401 when no Authorization header is present', async () => {
        const response = await request(app)
          .put('/api/profile/me')
          .send({ name: 'Test' });

        expect(response.status).toBe(401);
        expect(response.body.error).toMatch(/missing or invalid token/i);
      });
    });

    describe('successful updates', () => {
      let accessToken: string;
      let userId: number;

      beforeEach(async () => {
        const loginRes = await request(app)
          .post('/api/auth/device')
          .send({ deviceId: testDeviceId });

        accessToken = loginRes.body.accessToken;
        userId = loginRes.body.userId;

        // Clean the profile to a known state
        await prisma.profile.update({
          where: { userId },
          data: { name: 'Unnamed', message: '', imageUrl: '/defaults/default-avatar.png' },
        });
      });

      it('should update name and message independently, persisting to the database', async () => {
        // Update only name, verify message stays empty
        const nameRes = await request(app)
          .put('/api/profile/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'Alice' });

        expect(nameRes.status).toBe(200);
        expect(nameRes.body.name).toBe('Alice');
        expect(nameRes.body.message).toBe('');

        // Update only message, verify name is preserved
        const msgRes = await request(app)
          .put('/api/profile/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ message: 'Hello world' });

        expect(msgRes.status).toBe(200);
        expect(msgRes.body.name).toBe('Alice');
        expect(msgRes.body.message).toBe('Hello world');

        const profile = await prisma.profile.findUnique({ where: { userId } });
        expect(profile?.name).toBe('Alice');
        expect(profile?.message).toBe('Hello world');
      });

      it('should update both name and message in a single request', async () => {
        const response = await request(app)
          .put('/api/profile/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'Bob', message: 'Living the dream' });

        expect(response.status).toBe(200);
        expect(response.body.name).toBe('Bob');
        expect(response.body.message).toBe('Living the dream');

        const profile = await prisma.profile.findUnique({ where: { userId } });
        expect(profile?.name).toBe('Bob');
        expect(profile?.message).toBe('Living the dream');
      });
    });

    describe('validation errors', () => {
      let accessToken: string;

      beforeEach(async () => {
        const loginRes = await request(app)
          .post('/api/auth/device')
          .send({ deviceId: testDeviceId });

        accessToken = loginRes.body.accessToken;
      });

      it('should return 400 when name exceeds 25 characters with validation details', async () => {
        const longName = 'A'.repeat(26);

        const response = await request(app)
          .put('/api/profile/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: longName });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid input');
        expect(response.body).toHaveProperty('details');
        expect(response.body.details).toHaveProperty('fieldErrors');
      });

      it('should return 400 when message exceeds 255 characters with validation details', async () => {
        const longMessage = 'M'.repeat(256);

        const response = await request(app)
          .put('/api/profile/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ message: longMessage });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid input');
        expect(response.body).toHaveProperty('details');
      });

      it('should return 400 when name is empty string', async () => {
        const response = await request(app)
          .put('/api/profile/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: '' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid input');
        expect(response.body).toHaveProperty('details');
        expect(response.body.details).toHaveProperty('fieldErrors');
      });
    });
  });
});
