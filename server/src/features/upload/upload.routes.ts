import { Router } from 'express';
import multer from 'multer';
import { uploadProfile, deleteProfile } from './upload.controller';
import { authenticateJWT } from '../../shared/middleware/jwtAuth';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1,
  },
});

const router = Router();

router.post(
  '/profile',
  authenticateJWT,
  upload.single('image'),
  uploadProfile
);

router.delete('/profile', authenticateJWT, deleteProfile);

export default router;
