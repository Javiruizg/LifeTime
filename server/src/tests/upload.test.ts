import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import jwt from 'jsonwebtoken';
import { Response } from 'express';
import request from 'supertest';

const TEST_UPLOADS_DIR = path.join(__dirname, 'test-uploads');
process.env.UPLOADS_DIR = TEST_UPLOADS_DIR;

import app from '../app';
import { prisma } from '../shared/lib/prisma';
import { UploadService, UploadError } from '../features/upload/upload.service';
import { uploadProfile, deleteProfile } from '../features/upload/upload.controller';
import type { AuthenticatedRequest } from '../shared/types/auth';
import { hashToken } from '../shared/lib/hash';

const JWT_SECRET = process.env.JWT_SECRET!;

async function createTestImageBuffer(width: number, height: number): Promise<Buffer> {
  const red = Buffer.alloc(width * height * 3, 255);
  return sharp(red, { raw: { width, height, channels: 3 } })
    .jpeg()
    .toBuffer();
}

async function createPngBuffer(): Promise<Buffer> {
  const red = Buffer.alloc(100 * 100 * 3, 0);
  return sharp(red, { raw: { width: 100, height: 100, channels: 3 } })
    .png()
    .toBuffer();
}

async function createWebpBuffer(): Promise<Buffer> {
  const red = Buffer.alloc(100 * 100 * 3, 128);
  return sharp(red, { raw: { width: 100, height: 100, channels: 3 } })
    .webp()
    .toBuffer();
}

describe('Upload', () => {
  beforeAll(async () => {
    await fs.rm(TEST_UPLOADS_DIR, { recursive: true, force: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_UPLOADS_DIR, { recursive: true, force: true });
  });

  describe('Storage (LocalStorageAdapter)', () => {
    let adapter: import('../features/upload/storage/local.storage').LocalStorageAdapter;

    beforeAll(() => {
      jest.resetModules();
      const { LocalStorageAdapter } = require('../features/upload/storage/local.storage');
      adapter = new LocalStorageAdapter();
    });

    beforeEach(async () => {
      await fs.rm(TEST_UPLOADS_DIR, { recursive: true, force: true });
    });

    afterAll(async () => {
      await fs.rm(TEST_UPLOADS_DIR, { recursive: true, force: true });
    });

    describe('save', () => {
      it('should create the directory and write the file', async () => {
        const buffer = Buffer.from('test image content');
        const url = await adapter.save('profiles', 'test_abc123.webp', buffer);

        expect(url).toBe('/uploads/profiles/test_abc123.webp');

        const filePath = path.join(TEST_UPLOADS_DIR, 'profiles', 'test_abc123.webp');
        const content = await fs.readFile(filePath);
        expect(content).toEqual(buffer);
      });

      it('should create nested subdirectories if they do not exist', async () => {
        const buffer = Buffer.from('nested content');
        const url = await adapter.save('avatars/thumbnails', 'img.webp', buffer);

        expect(url).toBe('/uploads/avatars/thumbnails/img.webp');

        const filePath = path.join(TEST_UPLOADS_DIR, 'avatars', 'thumbnails', 'img.webp');
        const content = await fs.readFile(filePath);
        expect(content).toEqual(buffer);
      });

      it('should overwrite an existing file with the same name', async () => {
        const buffer1 = Buffer.from('first content');
        const buffer2 = Buffer.from('second content');

        await adapter.save('profiles', 'overwrite.webp', buffer1);
        await adapter.save('profiles', 'overwrite.webp', buffer2);

        const filePath = path.join(TEST_UPLOADS_DIR, 'profiles', 'overwrite.webp');
        const content = await fs.readFile(filePath);
        expect(content).toEqual(buffer2);
      });

      it('should return a URL path starting with /uploads/', async () => {
        const buffer = Buffer.from('url test');
        const url = await adapter.save('profiles', 'url_test.webp', buffer);

        expect(url).toMatch(/^\/uploads\//);
        expect(url).toContain('url_test.webp');
      });
    });

    describe('delete', () => {
      it('should delete an existing file', async () => {
        const buffer = Buffer.from('to delete');
        await adapter.save('profiles', 'delete_me.webp', buffer);

        const filePath = path.join(TEST_UPLOADS_DIR, 'profiles', 'delete_me.webp');
        expect(await fs.stat(filePath)).toBeTruthy();

        await adapter.delete('/uploads/profiles/delete_me.webp');

        await expect(fs.stat(filePath)).rejects.toThrow('ENOENT');
      });

      it('should not throw when deleting a non-existent file', async () => {
        await expect(
          adapter.delete('/uploads/profiles/nonexistent.webp')
        ).resolves.toBeUndefined();
      });

      it('should correctly parse the relative path from the URL', async () => {
        const buffer = Buffer.from('path test');
        await adapter.save('profiles', 'path_test.webp', buffer);

        await adapter.delete('/uploads/profiles/path_test.webp');

        const filePath = path.join(TEST_UPLOADS_DIR, 'profiles', 'path_test.webp');
        await expect(fs.stat(filePath)).rejects.toThrow('ENOENT');
      });
    });
  });

  describe('Service (UploadService)', () => {
    let service: UploadService;
    const testDeviceId = 'upload-test-user';
    let userId: number;

    beforeEach(async () => {
      await fs.rm(TEST_UPLOADS_DIR, { recursive: true, force: true });
      await prisma.user.deleteMany({ where: { deviceId: hashToken(testDeviceId) } });
      const user = await prisma.user.create({ data: { deviceId: hashToken(testDeviceId) } });
      await prisma.profile.create({ data: { userId: user.id } });
      userId = user.id;
      service = new UploadService();
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { deviceId: hashToken(testDeviceId) } });
    });

    describe('uploadProfileImage', () => {
      describe('validation', () => {
        it('should throw UploadError with 400 for invalid mime type', async () => {
          const buffer = Buffer.from('some data');
          await expect(service.uploadProfileImage(userId, buffer, 'image/gif'))
            .rejects
            .toThrow(UploadError);

          try {
            await service.uploadProfileImage(userId, buffer, 'image/gif');
          } catch (err) {
            expect((err as UploadError).statusCode).toBe(400);
            expect((err as UploadError).message).toContain('Invalid file type');
          }
        });

        it('should throw UploadError with 400 for application/octet-stream', async () => {
          const buffer = Buffer.from('some data');
          await expect(service.uploadProfileImage(userId, buffer, 'application/octet-stream'))
            .rejects
            .toThrow(UploadError);
        });

        it('should throw UploadError with 413 for file larger than 5MB', async () => {
          const buffer = Buffer.alloc(6 * 1024 * 1024, 0);
          await expect(service.uploadProfileImage(userId, buffer, 'image/jpeg'))
            .rejects
            .toThrow(UploadError);

          try {
            await service.uploadProfileImage(userId, buffer, 'image/jpeg');
          } catch (err) {
            expect((err as UploadError).statusCode).toBe(413);
          }
        });

        it('should throw UploadError with 400 for invalid image data', async () => {
          const buffer = Buffer.from('this is not an image');
          await expect(service.uploadProfileImage(userId, buffer, 'image/jpeg'))
            .rejects
            .toThrow(UploadError);
        });
      });

      describe('image processing', () => {
        it('should accept image/jpeg', async () => {
          const buffer = await createTestImageBuffer(200, 200);
          const url = await service.uploadProfileImage(userId, buffer, 'image/jpeg');
          expect(url).toMatch(/^\/uploads\/profiles\/\d+_.*\.webp$/);
        });

        it('should accept image/png', async () => {
          const buffer = await createPngBuffer();
          const url = await service.uploadProfileImage(userId, buffer, 'image/png');
          expect(url).toMatch(/^\/uploads\/profiles\/\d+_.*\.webp$/);
        });

        it('should accept image/webp', async () => {
          const buffer = await createWebpBuffer();
          const url = await service.uploadProfileImage(userId, buffer, 'image/webp');
          expect(url).toMatch(/^\/uploads\/profiles\/\d+_.*\.webp$/);
        });

        it('should resize the image to 512x512', async () => {
          const buffer = await createTestImageBuffer(1024, 512);
          const url = await service.uploadProfileImage(userId, buffer, 'image/jpeg');

          const filePath = path.join(TEST_UPLOADS_DIR, url.replace('/uploads/', ''));
          const savedBuffer = await fs.readFile(filePath);
          const metadata = await sharp(savedBuffer).metadata();

          expect(metadata.width).toBe(512);
          expect(metadata.height).toBe(512);
        });

        it('should convert the output to webp format', async () => {
          const buffer = await createTestImageBuffer(200, 200);
          const url = await service.uploadProfileImage(userId, buffer, 'image/jpeg');

          const filePath = path.join(TEST_UPLOADS_DIR, url.replace('/uploads/', ''));
          const savedBuffer = await fs.readFile(filePath);
          const metadata = await sharp(savedBuffer).metadata();

          expect(metadata.format).toBe('webp');
        });

        it('should crop non-square images with cover fit', async () => {
          const buffer = await createTestImageBuffer(1000, 200);
          const url = await service.uploadProfileImage(userId, buffer, 'image/jpeg');

          const filePath = path.join(TEST_UPLOADS_DIR, url.replace('/uploads/', ''));
          const savedBuffer = await fs.readFile(filePath);
          const metadata = await sharp(savedBuffer).metadata();

          expect(metadata.width).toBe(512);
          expect(metadata.height).toBe(512);
        });
      });

      describe('database integration', () => {
        it('should update the profile imageUrl in the database', async () => {
          const buffer = await createTestImageBuffer(200, 200);
          const url = await service.uploadProfileImage(userId, buffer, 'image/jpeg');

          const profile = await prisma.profile.findUnique({
            where: { userId },
            select: { imageUrl: true },
          });

          expect(profile?.imageUrl).toBe(url);
        });

        it('should delete the old image file when replacing', async () => {
          const buffer1 = await createTestImageBuffer(200, 200);
          const url1 = await service.uploadProfileImage(userId, buffer1, 'image/jpeg');

          const filePath1 = path.join(TEST_UPLOADS_DIR, url1.replace('/uploads/', ''));
          expect(await fs.stat(filePath1)).toBeTruthy();

          const buffer2 = await createTestImageBuffer(300, 300);
          const url2 = await service.uploadProfileImage(userId, buffer2, 'image/jpeg');

          await expect(fs.stat(filePath1)).rejects.toThrow('ENOENT');

          const profile = await prisma.profile.findUnique({
            where: { userId },
            select: { imageUrl: true },
          });
          expect(profile?.imageUrl).toBe(url2);
        });

        it('should include userId in the filename', async () => {
          const buffer = await createTestImageBuffer(200, 200);
          const url = await service.uploadProfileImage(userId, buffer, 'image/jpeg');

          expect(url).toContain(`${userId}_`);
        });

        it('should generate unique filenames for successive uploads', async () => {
          const buffer = await createTestImageBuffer(200, 200);
          const url1 = await service.uploadProfileImage(userId, buffer, 'image/jpeg');
          const url2 = await service.uploadProfileImage(userId, buffer, 'image/jpeg');

          expect(url1).not.toBe(url2);
        });
      });
    });

    describe('deleteProfileImage', () => {
      it('should delete the image file and set imageUrl to null', async () => {
        const buffer = await createTestImageBuffer(200, 200);
        const url = await service.uploadProfileImage(userId, buffer, 'image/jpeg');

        const filePath = path.join(TEST_UPLOADS_DIR, url.replace('/uploads/', ''));
        expect(await fs.stat(filePath)).toBeTruthy();

        await service.deleteProfileImage(userId);

        await expect(fs.stat(filePath)).rejects.toThrow('ENOENT');

        const profile = await prisma.profile.findUnique({
          where: { userId },
          select: { imageUrl: true },
        });
        expect(profile?.imageUrl).toBeNull();
      });

      it('should do nothing if the user has no profile image', async () => {
        await expect(service.deleteProfileImage(userId)).resolves.toBeUndefined();

        const profile = await prisma.profile.findUnique({
          where: { userId },
          select: { imageUrl: true },
        });
        expect(profile?.imageUrl).toBeNull();
      });

      it('should not throw if the file is already missing from disk', async () => {
        const buffer = await createTestImageBuffer(200, 200);
        const url = await service.uploadProfileImage(userId, buffer, 'image/jpeg');

        const filePath = path.join(TEST_UPLOADS_DIR, url.replace('/uploads/', ''));
        await fs.unlink(filePath);

        await expect(service.deleteProfileImage(userId)).resolves.toBeUndefined();

        const profile = await prisma.profile.findUnique({
          where: { userId },
          select: { imageUrl: true },
        });
        expect(profile?.imageUrl).toBeNull();
      });
    });
  });

  describe('Controller', () => {
    let mockReq: Partial<AuthenticatedRequest>;
    let mockRes: Partial<Response>;
    let mockJson: jest.Mock;
    let mockStatus: jest.Mock;
    let mockSend: jest.Mock;
    let service: UploadService;
    const testDeviceId = 'upload-controller-user';
    let userId: number;

    beforeEach(async () => {
      await fs.rm(TEST_UPLOADS_DIR, { recursive: true, force: true });
      await prisma.user.deleteMany({ where: { deviceId: hashToken(testDeviceId) } });
      const user = await prisma.user.create({ data: { deviceId: hashToken(testDeviceId) } });
      await prisma.profile.create({ data: { userId: user.id } });
      userId = user.id;
      service = new UploadService();

      mockJson = jest.fn();
      mockSend = jest.fn();
      mockStatus = jest.fn().mockReturnValue({ json: mockJson, send: mockSend });

      mockReq = { user: { id: userId } };
      mockRes = { status: mockStatus, json: mockJson, send: mockSend };
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { deviceId: hashToken(testDeviceId) } });
    });

    describe('uploadProfile', () => {
      it('should return 400 if no file is provided', async () => {
        (mockReq as any).file = undefined;

        await uploadProfile(mockReq as AuthenticatedRequest, mockRes as Response);

        expect(mockStatus).toHaveBeenCalledWith(400);
        expect(mockJson).toHaveBeenCalledWith({ error: 'No image file provided' });
      });

      it('should return 200 with imageUrl on valid upload', async () => {
        const fileBuffer = await createTestImageBuffer(200, 200);
        (mockReq as any).file = { buffer: fileBuffer, mimetype: 'image/jpeg' };

        await uploadProfile(mockReq as AuthenticatedRequest, mockRes as Response);

        expect(mockStatus).toHaveBeenCalledWith(200);
        expect(mockJson).toHaveBeenCalledWith(
          expect.objectContaining({ imageUrl: expect.stringMatching(/^\/uploads\/profiles\/\d+_.*\.webp$/) })
        );
      });

      it('should return 400 for invalid mime type', async () => {
        (mockReq as any).file = { buffer: Buffer.from('test'), mimetype: 'image/gif' };

        await uploadProfile(mockReq as AuthenticatedRequest, mockRes as Response);

        expect(mockStatus).toHaveBeenCalledWith(400);
        expect(mockJson).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.stringContaining('Invalid file type') })
        );
      });

      it('should return 413 for file too large', async () => {
        (mockReq as any).file = { buffer: Buffer.alloc(6 * 1024 * 1024), mimetype: 'image/jpeg' };

        await uploadProfile(mockReq as AuthenticatedRequest, mockRes as Response);

        expect(mockStatus).toHaveBeenCalledWith(413);
        expect(mockJson).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.stringContaining('File too large') })
        );
      });

      it('should return 400 for invalid image data', async () => {
        (mockReq as any).file = { buffer: Buffer.from('not an image'), mimetype: 'image/jpeg' };

        await uploadProfile(mockReq as AuthenticatedRequest, mockRes as Response);

        expect(mockStatus).toHaveBeenCalledWith(400);
        expect(mockJson).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.stringContaining('Failed to process') })
        );
      });

      it('should update the database with the new imageUrl', async () => {
        const fileBuffer = await createTestImageBuffer(200, 200);
        (mockReq as any).file = { buffer: fileBuffer, mimetype: 'image/jpeg' };

        await uploadProfile(mockReq as AuthenticatedRequest, mockRes as Response);

        const profile = await prisma.profile.findUnique({
          where: { userId },
          select: { imageUrl: true },
        });
        expect(profile?.imageUrl).toMatch(/^\/uploads\/profiles\/\d+_.*\.webp$/);
      });
    });

    describe('deleteProfile', () => {
      it('should return 204 on success when image exists', async () => {
        const fileBuffer = await createTestImageBuffer(200, 200);
        (mockReq as any).file = { buffer: fileBuffer, mimetype: 'image/jpeg' };
        await uploadProfile(mockReq as AuthenticatedRequest, mockRes as Response);

        mockJson = jest.fn();
        mockSend = jest.fn();
        mockStatus = jest.fn().mockReturnValue({ json: mockJson, send: mockSend });
        mockRes = { status: mockStatus, json: mockJson, send: mockSend };

        await deleteProfile(mockReq as AuthenticatedRequest, mockRes as Response);

        expect(mockStatus).toHaveBeenCalledWith(204);
        expect(mockSend).toHaveBeenCalled();
      });

      it('should return 204 even if user has no profile image', async () => {
        await deleteProfile(mockReq as AuthenticatedRequest, mockRes as Response);

        expect(mockStatus).toHaveBeenCalledWith(204);
        expect(mockSend).toHaveBeenCalled();
      });

      it('should delete the image file and clear imageUrl in DB', async () => {
        const fileBuffer = await createTestImageBuffer(200, 200);
        (mockReq as any).file = { buffer: fileBuffer, mimetype: 'image/jpeg' };
        await uploadProfile(mockReq as AuthenticatedRequest, mockRes as Response);

        const profileBefore = await prisma.profile.findUnique({
          where: { userId },
          select: { imageUrl: true },
        });
        const filePath = path.join(TEST_UPLOADS_DIR, profileBefore!.imageUrl!.replace('/uploads/', ''));
        expect(await fs.stat(filePath)).toBeTruthy();

        mockJson = jest.fn();
        mockSend = jest.fn();
        mockStatus = jest.fn().mockReturnValue({ json: mockJson, send: mockSend });
        mockRes = { status: mockStatus, json: mockJson, send: mockSend };

        await deleteProfile(mockReq as AuthenticatedRequest, mockRes as Response);

        await expect(fs.stat(filePath)).rejects.toThrow('ENOENT');
        const profileAfter = await prisma.profile.findUnique({
          where: { userId },
          select: { imageUrl: true },
        });
        expect(profileAfter?.imageUrl).toBeNull();
      });
    });
  });

  describe('Integration (routes E2E)', () => {
    const testDeviceId = 'upload-integration-user';
    let authToken: string;
    let userId: number;

    beforeEach(async () => {
      await fs.rm(TEST_UPLOADS_DIR, { recursive: true, force: true });
      await prisma.user.deleteMany({ where: { deviceId: hashToken(testDeviceId) } });

      const user = await prisma.user.create({ data: { deviceId: hashToken(testDeviceId) } });
      await prisma.profile.create({ data: { userId: user.id } });
      userId = user.id;

      authToken = jwt.sign({ userId: user.id, type: 'access' }, JWT_SECRET);
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { deviceId: hashToken(testDeviceId) } });
      await prisma.$disconnect();
    });

    describe('POST /api/upload/profile', () => {
      describe('authentication', () => {
        it('should return 401 if no Authorization header is provided', async () => {
          const response = await request(app)
            .post('/api/upload/profile')
            .attach('image', Buffer.from('test'), 'test.jpg');

          expect(response.status).toBe(401);
        });

        it('should return 401 if token is invalid', async () => {
          const response = await request(app)
            .post('/api/upload/profile')
            .set('Authorization', 'Bearer invalid-token')
            .attach('image', Buffer.from('test'), 'test.jpg');

          expect(response.status).toBe(401);
        });

        it('should return 401 if using a refresh token', async () => {
          const refreshToken = jwt.sign({ userId: 1, type: 'refresh' }, JWT_SECRET);
          const response = await request(app)
            .post('/api/upload/profile')
            .set('Authorization', `Bearer ${refreshToken}`)
            .attach('image', Buffer.from('test'), 'test.jpg');

          expect(response.status).toBe(401);
        });
      });

      describe('file validation', () => {
        it('should return 400 if no image field is provided', async () => {
          const response = await request(app)
            .post('/api/upload/profile')
            .set('Authorization', `Bearer ${authToken}`);

          expect(response.status).toBe(400);
          expect(response.body.error).toBe('No image file provided');
        });

        it('should return 200 and imageUrl for a valid JPEG upload', async () => {
          const imageBuffer = await createTestImageBuffer(200, 200);

          const response = await request(app)
            .post('/api/upload/profile')
            .set('Authorization', `Bearer ${authToken}`)
            .attach('image', imageBuffer, 'photo.jpg');

          expect(response.status).toBe(200);
          expect(response.body).toHaveProperty('imageUrl');
          expect(response.body.imageUrl).toMatch(/^\/uploads\/profiles\/\d+_.*\.webp$/);
        });

        it('should return 200 and imageUrl for a valid PNG upload', async () => {
          const imageBuffer = await createPngBuffer();

          const response = await request(app)
            .post('/api/upload/profile')
            .set('Authorization', `Bearer ${authToken}`)
            .attach('image', imageBuffer, 'photo.png');

          expect(response.status).toBe(200);
          expect(response.body).toHaveProperty('imageUrl');
        });

        it('should reject non-image files (e.g. text)', async () => {
          const response = await request(app)
            .post('/api/upload/profile')
            .set('Authorization', `Bearer ${authToken}`)
            .attach('image', Buffer.from('not an image'), 'file.txt');

          expect(response.status).toBe(400);
          expect(response.body.error).toContain('Invalid file type');
        });
      });

      describe('image processing', () => {
        it('should save the image as webp', async () => {
          const imageBuffer = await createTestImageBuffer(200, 200);

          const response = await request(app)
            .post('/api/upload/profile')
            .set('Authorization', `Bearer ${authToken}`)
            .attach('image', imageBuffer, 'photo.jpg');

          const imageUrl = response.body.imageUrl;
          const filePath = path.join(TEST_UPLOADS_DIR, imageUrl.replace('/uploads/', ''));
          const savedBuffer = await fs.readFile(filePath);
          const metadata = await sharp(savedBuffer).metadata();

          expect(metadata.format).toBe('webp');
        });

        it('should resize to 512x512', async () => {
          const imageBuffer = await createTestImageBuffer(1024, 768);

          const response = await request(app)
            .post('/api/upload/profile')
            .set('Authorization', `Bearer ${authToken}`)
            .attach('image', imageBuffer, 'photo.jpg');

          const imageUrl = response.body.imageUrl;
          const filePath = path.join(TEST_UPLOADS_DIR, imageUrl.replace('/uploads/', ''));
          const savedBuffer = await fs.readFile(filePath);
          const metadata = await sharp(savedBuffer).metadata();

          expect(metadata.width).toBe(512);
          expect(metadata.height).toBe(512);
        });
      });

      describe('database update', () => {
        it('should update the profile imageUrl in the database', async () => {
          const imageBuffer = await createTestImageBuffer(200, 200);

          const response = await request(app)
            .post('/api/upload/profile')
            .set('Authorization', `Bearer ${authToken}`)
            .attach('image', imageBuffer, 'photo.jpg');

          const profile = await prisma.profile.findUnique({
            where: { userId },
            select: { imageUrl: true },
          });

          expect(profile?.imageUrl).toBe(response.body.imageUrl);
        });

        it('should replace the old image when uploading a new one', async () => {
          const imageBuffer1 = await createTestImageBuffer(200, 200);
          const res1 = await request(app)
            .post('/api/upload/profile')
            .set('Authorization', `Bearer ${authToken}`)
            .attach('image', imageBuffer1, 'photo1.jpg');

          const oldUrl = res1.body.imageUrl;
          const oldPath = path.join(TEST_UPLOADS_DIR, oldUrl.replace('/uploads/', ''));
          expect(await fs.stat(oldPath)).toBeTruthy();

          const imageBuffer2 = await createTestImageBuffer(300, 300);
          const res2 = await request(app)
            .post('/api/upload/profile')
            .set('Authorization', `Bearer ${authToken}`)
            .attach('image', imageBuffer2, 'photo2.jpg');

          await expect(fs.stat(oldPath)).rejects.toThrow('ENOENT');

          const profile = await prisma.profile.findUnique({
            where: { userId },
            select: { imageUrl: true },
          });
          expect(profile?.imageUrl).toBe(res2.body.imageUrl);
        });
      });
    });

    describe('DELETE /api/upload/profile', () => {
      describe('authentication', () => {
        it('should return 401 if no Authorization header is provided', async () => {
          const response = await request(app).delete('/api/upload/profile');
          expect(response.status).toBe(401);
        });

        it('should return 401 if token is invalid', async () => {
          const response = await request(app)
            .delete('/api/upload/profile')
            .set('Authorization', 'Bearer invalid-token');

          expect(response.status).toBe(401);
        });
      });

      describe('deletion', () => {
        it('should return 204 and delete the profile image', async () => {
          const imageBuffer = await createTestImageBuffer(200, 200);
          const uploadRes = await request(app)
            .post('/api/upload/profile')
            .set('Authorization', `Bearer ${authToken}`)
            .attach('image', imageBuffer, 'photo.jpg');

          const imageUrl = uploadRes.body.imageUrl;
          const filePath = path.join(TEST_UPLOADS_DIR, imageUrl.replace('/uploads/', ''));
          expect(await fs.stat(filePath)).toBeTruthy();

          const response = await request(app)
            .delete('/api/upload/profile')
            .set('Authorization', `Bearer ${authToken}`);

          expect(response.status).toBe(204);
          await expect(fs.stat(filePath)).rejects.toThrow('ENOENT');

          const profile = await prisma.profile.findUnique({
            where: { userId },
            select: { imageUrl: true },
          });
          expect(profile?.imageUrl).toBeNull();
        });

        it('should return 204 even if user has no profile image', async () => {
          const response = await request(app)
            .delete('/api/upload/profile')
            .set('Authorization', `Bearer ${authToken}`);

          expect(response.status).toBe(204);
        });
      });
    });

    describe('static file serving', () => {
      it('should serve the uploaded image at the returned URL', async () => {
        const imageBuffer = await createTestImageBuffer(200, 200);

        const uploadRes = await request(app)
          .post('/api/upload/profile')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('image', imageBuffer, 'photo.jpg');

        const imageUrl = uploadRes.body.imageUrl;

        const response = await request(app).get(imageUrl);

        expect(response.status).toBe(200);
        expect(response.type).toBe('image/webp');
      });
    });
  });
});
