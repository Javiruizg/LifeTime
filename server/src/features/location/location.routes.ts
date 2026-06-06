import { Router } from 'express';
import {
  connectLocationController,
  disconnectLocationController,
  getLocationStatusController,
} from './location.controller';
import { authenticateJWT } from '../../shared/middleware/jwtAuth';

const router = Router();

router.post('/connect', authenticateJWT, connectLocationController);
router.post('/disconnect', authenticateJWT, disconnectLocationController);
router.get('/status', authenticateJWT, getLocationStatusController);

export default router;
