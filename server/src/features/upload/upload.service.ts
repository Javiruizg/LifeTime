import crypto from 'crypto';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../../shared/lib/prisma';
import { createStorageAdapter, StorageAdapter } from './storage';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const PROFILE_SIZE = 512;
const PROFILE_QUALITY = 80;

export class UploadService {
  private storage: StorageAdapter;

  constructor() {
    this.storage = createStorageAdapter();
  }

  /**
   * Process and save a profile avatar.
   * @returns The public URL of the saved image.
   */
  async uploadProfileImage(
    userId: number,
    buffer: Buffer,
    mimetype: string
  ): Promise<string> {

    console.log(`Uploading profile image for user ${userId}`);
    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
      throw new UploadError(
        `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
        400
      );
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new UploadError(
        `File too large. Max size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`,
        413
      );
    }

    // Process image with sharp
    let processedBuffer: Buffer;
    try {
      processedBuffer = await sharp(buffer)
        .resize(PROFILE_SIZE, PROFILE_SIZE, { fit: 'cover', position: 'centre' })
        .webp({ quality: PROFILE_QUALITY })
        .toBuffer();
    } catch (err) {
      throw new UploadError(
        'Failed to process image. Ensure the file is a valid image.',
        400
      );
    }

    // Generate unique filename
    const randomHex = crypto.randomBytes(8).toString('hex');
    const filename = `${userId}_${randomHex}.webp`;

    // Save via storage adapter
    const imageUrl = await this.storage.save('profiles', filename, processedBuffer);

    // Update database
    const existingProfile = await prisma.profile.findUnique({
      where: { userId },
      select: { imageUrl: true },
    });

    // Delete old image if replacing
    if (existingProfile?.imageUrl) {
      try {
        await this.storage.delete(existingProfile.imageUrl);
      } catch (err) {
        console.warn('Failed to delete old profile image:', err);
      }
    }

    await prisma.profile.update({
      where: { userId },
      data: { imageUrl },
    });

    console.log(`Profile image uploaded successfully for user ${userId}`);
    return imageUrl;
  }

  /**
   * Delete a user's profile avatar.
   */
  async deleteProfileImage(userId: number): Promise<void> {
    console.log(`Deleting profile image for user ${userId}`);
    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { imageUrl: true },
    });

    if (profile?.imageUrl) {
      await this.storage.delete(profile.imageUrl);
    }

    await prisma.profile.update({
      where: { userId },
      data: { imageUrl: '/defaults/default-avatar.png' },
    });
  }
}

export class UploadError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'UploadError';
  }
}
