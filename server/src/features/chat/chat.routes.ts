import { Router } from 'express';
import {
  createOrGetPrivateChatController,
  getMessagesController,
  sendMessageController,
  markSeenController,
} from './chat.controller';
import { authenticateJWT } from '../../shared/middleware/jwtAuth';

const router = Router();

router.post('/private/:userId', authenticateJWT, createOrGetPrivateChatController);
router.get('/:chatId/messages', authenticateJWT, getMessagesController);
router.post('/:chatId/messages', authenticateJWT, sendMessageController);
router.put('/:chatId/seen', authenticateJWT, markSeenController);

export default router;
