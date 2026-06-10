import { Router } from 'express';
import { getNearbyGroupsController, joinGroupController } from './group.controller';
import { authenticateJWT } from '../../shared/middleware/jwtAuth';

const router = Router();

router.get('/nearby', authenticateJWT, getNearbyGroupsController);
router.post('/:chatId/join', authenticateJWT, joinGroupController);

export default router;
