import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import app from '../app';
import { prisma } from '../shared/lib/prisma';
import { authenticateJWT } from '../shared/middleware/jwtAuth';
import { hashToken } from '../shared/lib/hash';

describe('Auth endpoints', () => {
  const testDeviceId = 'test-device-123';
  const secondDeviceId = 'test-device-456';
  const uuidDeviceId = '550e8400-e29b-41d4-a716-446655440000';
  const JWT_SECRET = process.env.JWT_SECRET!;
  const JWT_SECRET_REFRESH = process.env.JWT_SECRET_REFRESH!;

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { deviceId: { in: [hashToken(testDeviceId), hashToken(secondDeviceId), hashToken(uuidDeviceId)] } },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { deviceId: { in: [hashToken(testDeviceId), hashToken(secondDeviceId), hashToken(uuidDeviceId)] } },
    });
    await prisma.$disconnect();
  });

  describe('POST /api/auth/device', () => {
    describe('Positive cases', () => {
      it('should register a new user with a plain deviceId', async () => {
        const response = await request(app)
          .post('/api/auth/device')
          .send({ deviceId: testDeviceId });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body).toHaveProperty('accessToken');
        expect(response.body).toHaveProperty('refreshToken');
        expect(response.body).toHaveProperty('userId');
        expect(response.body.isNewUser).toBe(true);
      });

      it('should login an existing user and return isNewUser false', async () => {
        await request(app)
          .post('/api/auth/device')
          .send({ deviceId: testDeviceId });

        const response = await request(app)
          .post('/api/auth/device')
          .send({ deviceId: testDeviceId });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.isNewUser).toBe(false);
        expect(response.body).toHaveProperty('accessToken');
        expect(response.body).toHaveProperty('refreshToken');
        expect(response.body).toHaveProperty('userId');
      });

      it('should create different users for different deviceIds', async () => {
        const first = await request(app)
          .post('/api/auth/device')
          .send({ deviceId: testDeviceId });

        const second = await request(app)
          .post('/api/auth/device')
          .send({ deviceId: secondDeviceId });

        expect(first.body.userId).not.toBe(second.body.userId);
        expect(first.body.isNewUser).toBe(true);
        expect(second.body.isNewUser).toBe(true);
      });

      it('should return a valid JWT access token with correct payload', async () => {
        const response = await request(app)
          .post('/api/auth/device')
          .send({ deviceId: testDeviceId });

        const decoded = jwt.verify(response.body.accessToken, JWT_SECRET) as jwt.JwtPayload;
        expect(decoded).toHaveProperty('userId', response.body.userId);
        expect(decoded).toHaveProperty('exp');
        expect(decoded).toHaveProperty('iat');
      });

      it('should return a valid JWT refresh token with correct claims', async () => {
        const response = await request(app)
          .post('/api/auth/device')
          .send({ deviceId: testDeviceId });

        const decoded = jwt.verify(response.body.refreshToken, JWT_SECRET_REFRESH) as jwt.JwtPayload;
        expect(decoded).toHaveProperty('userId', response.body.userId);
        expect(decoded).toHaveProperty('type', 'refresh');
        expect(decoded).toHaveProperty('jti');
        expect(decoded).toHaveProperty('exp');
        expect(decoded).toHaveProperty('iat');
      });

      it('should store the refresh token in the database', async () => {
        const response = await request(app)
          .post('/api/auth/device')
          .send({ deviceId: testDeviceId });

        const user = await prisma.user.findUnique({
          where: { deviceId: hashToken(testDeviceId) },
        });

        expect(user).not.toBeNull();
        expect(user!.refreshToken).toBe(hashToken(response.body.refreshToken));
      });

      it('should update the refresh token on subsequent logins', async () => {
        const first = await request(app)
          .post('/api/auth/device')
          .send({ deviceId: testDeviceId });

        const second = await request(app)
          .post('/api/auth/device')
          .send({ deviceId: testDeviceId });

        expect(second.body.refreshToken).not.toBe(first.body.refreshToken);

        const user = await prisma.user.findUnique({
          where: { deviceId: hashToken(testDeviceId) },
        });
        expect(user!.refreshToken).toBe(hashToken(second.body.refreshToken));
      });
    });

    describe('Negative cases', () => {
      it('should return 400 for missing deviceId', async () => {
        const response = await request(app)
          .post('/api/auth/device')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid input');
      });

      it('should return 400 for empty string deviceId', async () => {
        const response = await request(app)
          .post('/api/auth/device')
          .send({ deviceId: '' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid input');
      });

      it('should return 400 for numeric deviceId', async () => {
        const response = await request(app)
          .post('/api/auth/device')
          .send({ deviceId: 12345 });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid input');
      });

      it('should return 400 for null deviceId', async () => {
        const response = await request(app)
          .post('/api/auth/device')
          .send({ deviceId: null });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid input');
      });

      it('should return 400 when body is not JSON', async () => {
        const response = await request(app)
          .post('/api/auth/device')
          .set('Content-Type', 'text/plain')
          .send('deviceId=test-device');

        expect(response.status).toBe(400);
      });
    });
  });

  describe('POST /api/auth/refresh', () => {
    let validRefreshToken: string;
    let validAccessToken: string;
    let testUserId: number;

    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/device')
        .send({ deviceId: testDeviceId });

      validRefreshToken = loginResponse.body.refreshToken;
      validAccessToken = loginResponse.body.accessToken;
      testUserId = loginResponse.body.userId;
    });

    describe('Positive cases', () => {
      it('should return new tokens with a valid refresh token', async () => {
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: validRefreshToken });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body).toHaveProperty('accessToken');
        expect(response.body).toHaveProperty('refreshToken');
      });

      it('should rotate the refresh token on each refresh', async () => {
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: validRefreshToken });

        expect(response.body.refreshToken).not.toBe(validRefreshToken);
      });

      it('should return a valid JWT refresh token with correct claims after refresh', async () => {
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: validRefreshToken });

        const decoded = jwt.verify(response.body.refreshToken, JWT_SECRET_REFRESH) as jwt.JwtPayload;
        expect(decoded).toHaveProperty('userId', testUserId);
        expect(decoded).toHaveProperty('type', 'refresh');
        expect(decoded).toHaveProperty('jti');
      });

      it('should update the refresh token in the database after rotation', async () => {
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: validRefreshToken });

        const user = await prisma.user.findUnique({
          where: { id: testUserId },
        });
        expect(user!.refreshToken).toBe(hashToken(response.body.refreshToken));
      });

      it('should allow multiple successive refresh operations', async () => {
        const first = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: validRefreshToken });

        expect(first.status).toBe(200);

        const second = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: first.body.refreshToken });

        expect(second.status).toBe(200);
        expect(second.body.refreshToken).not.toBe(first.body.refreshToken);
      });
    });

    describe('Negative cases', () => {
      it('should return 401 for an invalid (non-JWT) refresh token', async () => {
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: 'invalid-token' });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Invalid or expired refresh token');
      });

      it('should return 400 for missing refreshToken', async () => {
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid input');
      });

      it('should return 400 for empty string refreshToken', async () => {
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: '' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid input');
      });

      it('should reject an access token used as a refresh token', async () => {
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: validAccessToken });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Invalid or expired refresh token');
      });

      it('should invalidate old refresh token after rotation', async () => {
        const refreshResponse = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: validRefreshToken });

        expect(refreshResponse.status).toBe(200);

        const reuseResponse = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: validRefreshToken });

        expect(reuseResponse.status).toBe(401);
        expect(reuseResponse.body.error).toBe('Invalid or expired refresh token');
      });

      it('should reject a tampered JWT token', async () => {
        const decoded = jwt.verify(validRefreshToken, JWT_SECRET_REFRESH) as jwt.JwtPayload;
        const tamperedPayload = { ...decoded, userId: 99999 };
        const tamperedToken = jwt.sign(tamperedPayload, 'wrong-secret');

        const response = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: tamperedToken });

        expect(response.status).toBe(401);
      });

      it('should return 400 for null refreshToken', async () => {
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: null });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid input');
      });

      it('should return 400 for numeric refreshToken', async () => {
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: 12345 });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid input');
      });

      it('should reject a refresh token belonging to a deleted user', async () => {
        const loginResponse = await request(app)
          .post('/api/auth/device')
          .send({ deviceId: secondDeviceId });

        const deletedUserRefreshToken = loginResponse.body.refreshToken;

        await prisma.user.deleteMany({
          where: { deviceId: hashToken(secondDeviceId) },
        });

        const response = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: deletedUserRefreshToken });

        expect(response.status).toBe(401);
      });

      it('should include validation details on invalid input', async () => {
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('details');
        expect(response.body.details).toHaveProperty('fieldErrors');
      });
    });
  });

  describe('Access token verification', () => {
    it('should contain userId matching the registered user', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/device')
        .send({ deviceId: testDeviceId });

      const decoded = jwt.verify(loginResponse.body.accessToken, JWT_SECRET) as jwt.JwtPayload;
      expect(decoded.userId).toBe(loginResponse.body.userId);
    });

    it('should not contain refresh-specific claims in the access token', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/device')
        .send({ deviceId: testDeviceId });

      const decoded = jwt.verify(loginResponse.body.accessToken, JWT_SECRET) as jwt.JwtPayload;
      expect(decoded).toHaveProperty('type', 'access');
      expect(decoded).not.toHaveProperty('jti');
    });

    it('should produce different access and refresh tokens', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/device')
        .send({ deviceId: testDeviceId });

      expect(loginResponse.body.accessToken).not.toBe(loginResponse.body.refreshToken);
    });
  });

  describe('Refresh token security', () => {
    it('should reject refresh operation if the token belongs to a different user in the database', async () => {
      const userA = await request(app)
        .post('/api/auth/device')
        .send({ deviceId: testDeviceId });

      const userB = await request(app)
        .post('/api/auth/device')
        .send({ deviceId: secondDeviceId });

      await prisma.user.update({
        where: { id: userA.body.userId },
        data: { refreshToken: hashToken('something-else') },
      });

      await prisma.user.update({
        where: { id: userB.body.userId },
        data: { refreshToken: hashToken(userA.body.refreshToken) },
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: userA.body.refreshToken });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid or expired refresh token');
    });

    it('should invalidate refresh token when user re-logins with same deviceId', async () => {
      const firstLogin = await request(app)
        .post('/api/auth/device')
        .send({ deviceId: testDeviceId });

      const firstRefreshToken = firstLogin.body.refreshToken;

      const secondLogin = await request(app)
        .post('/api/auth/device')
        .send({ deviceId: testDeviceId });

      expect(secondLogin.body.refreshToken).not.toBe(firstRefreshToken);

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: firstRefreshToken });

      expect(response.status).toBe(401);
    });
  });

  });