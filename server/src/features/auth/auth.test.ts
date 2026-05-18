import request from 'supertest';
import app from '../../app';
import { prisma } from '../../shared/lib/prisma';

describe('Auth endpoints', () => {
  const testDeviceId = 'test-device-123';

  beforeEach(async () => {
    // Limpiar usuario de prueba si existe
    await prisma.user.deleteMany({
      where: { deviceId: testDeviceId },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { deviceId: testDeviceId },
    });
    await prisma.$disconnect();
  });

  describe('POST /api/auth/device', () => {
    it('should register a new user with encrypted deviceId', async () => {
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

    it('should login existing user and return new tokens', async () => {
      // Primero crear el usuario
      await request(app)
        .post('/api/auth/device')
        .send({ deviceId: testDeviceId });

      // Luego hacer login con el mismo deviceId
      const response = await request(app)
        .post('/api/auth/device')
        .send({ deviceId: testDeviceId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.isNewUser).toBe(false);
    });

    it('should return 400 for invalid encrypted deviceId', async () => {
      const response = await request(app)
        .post('/api/auth/device')
        .send({ deviceId: 'invalid-encrypted-data' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid deviceId encryption');
    });

    it('should return 400 for missing deviceId', async () => {
      const response = await request(app)
        .post('/api/auth/device')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid input');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return new tokens with valid refresh token', async () => {
      // Primero crear el usuario y obtener tokens
      const loginResponse = await request(app)
        .post('/api/auth/device')
        .send({ deviceId: testDeviceId });

      const { refreshToken } = loginResponse.body;

      // Usar refresh token para obtener nuevos tokens
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.refreshToken).not.toBe(refreshToken); // Debe ser diferente (rotación)
    });

    it('should return 401 for invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid or expired refresh token');
    });

    it('should return 400 for missing refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid input');
    });

    it('should invalidate old refresh token after rotation', async () => {
      // Crear usuario y obtener tokens
      const loginResponse = await request(app)
        .post('/api/auth/device')
        .send({ deviceId: testDeviceId });

      const { refreshToken: oldRefreshToken } = loginResponse.body;

      // Rotar el token
      await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: oldRefreshToken });

      // Intentar usar el token antiguo de nuevo
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: oldRefreshToken });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid or expired refresh token');
    });
  });
});
