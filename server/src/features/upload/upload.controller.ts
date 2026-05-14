import { Request, Response } from 'express';
import { UploadService, UploadError } from './upload.service';
import { AuthenticatedRequest } from '../../shared/middleware/auth';

const uploadService = new UploadService();

/**
 * POST /api/upload/profile
 * Expects multipart/form-data with a field named "image".
 */
export async function uploadProfile(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const file = (req as any).file as Express.Multer.File | undefined;

    if (!file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }

    const imageUrl = await uploadService.uploadProfileImage(
      req.user.id,
      file.buffer,
      file.mimetype
    );

    res.status(200).json({ imageUrl });
  } catch (err) {
    if (err instanceof UploadError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('Upload profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * DELETE /api/upload/profile
 * Removes the user's current profile avatar.
 */
export async function deleteProfile(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await uploadService.deleteProfileImage(req.user.id);
    res.status(204).send();
  } catch (err) {
    console.error('Delete profile image error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
