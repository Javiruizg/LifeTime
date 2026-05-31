import { Router } from 'express';
import { getProfileController, updateProfileController } from './profile.controller';
import { authenticateJWT } from '../../shared/middleware/jwtAuth';

const router = Router();

router.get('/me', authenticateJWT, getProfileController);
router.put('/me', authenticateJWT, updateProfileController);

export default router;
