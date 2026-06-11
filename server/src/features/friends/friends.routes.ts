import { Router } from 'express';
import { authenticateJWT } from '../../shared/middleware/jwtAuth';
import {
  sendFriendRequestController,
  cancelFriendRequestController,
  acceptFriendRequestController,
  rejectFriendRequestController,
  removeFriendController,
  getFriendsController,
  getReceivedRequestsController,
  getFriendStatusController,
} from './friends.controller';

const router = Router();

router.post('/request', authenticateJWT, sendFriendRequestController);
router.delete('/request/:receiverId', authenticateJWT, cancelFriendRequestController);
router.post('/accept/:requestId', authenticateJWT, acceptFriendRequestController);
router.post('/reject/:requestId', authenticateJWT, rejectFriendRequestController);
router.delete('/:friendId', authenticateJWT, removeFriendController);
router.get('/', authenticateJWT, getFriendsController);
router.get('/requests', authenticateJWT, getReceivedRequestsController);
router.get('/status/:userId', authenticateJWT, getFriendStatusController);

export default router;
