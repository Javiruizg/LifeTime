import { Request, Response } from 'express';
import { ZodError } from 'zod';
import type { AuthenticatedRequest } from '../../shared/types/auth';
import {
  getOrCreatePrivateChat,
  getPaginatedMessages,
  createMessage,
  markMessagesAsSeen,
} from './chat.service';
import {
  createPrivateChatParamsSchema,
  chatIdParamsSchema,
  getMessagesQuerySchema,
  sendMessageBodySchema,
} from './chat.validation';

export async function createOrGetPrivateChatController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const params = createPrivateChatParamsSchema.parse(req.params);
    const chat = await getOrCreatePrivateChat(userId, params.userId);
    res.status(200).json(chat);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Invalid userId', details: err.issues });
      return;
    }
    console.error('createOrGetPrivateChat error:', err);
    res.status(500).json({ error: 'Failed to create or get private chat' });
  }
}

export async function getMessagesController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const params = chatIdParamsSchema.parse(req.params);
    const query = getMessagesQuerySchema.parse(req.query);

    const result = await getPaginatedMessages(
      params.chatId,
      userId,
      query.limit,
      query.cursor
    );

    res.status(200).json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Invalid parameters', details: err.issues });
      return;
    }
    if (err instanceof Error && err.message === 'Not a member of this chat') {
      res.status(403).json({ error: err.message });
      return;
    }
    console.error('getMessages error:', err);
    res.status(500).json({ error: 'Failed to get messages' });
  }
}

export async function sendMessageController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const params = chatIdParamsSchema.parse(req.params);
    const body = sendMessageBodySchema.parse(req.body);

    const message = await createMessage(params.chatId, userId, body.content);
    res.status(201).json(message);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.issues });
      return;
    }
    if (err instanceof Error && err.message === 'Not a member of this chat') {
      res.status(403).json({ error: err.message });
      return;
    }
    console.error('sendMessage error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
}

export async function markSeenController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const params = chatIdParamsSchema.parse(req.params);
    const result = await markMessagesAsSeen(params.chatId, userId);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Invalid chatId', details: err.issues });
      return;
    }
    if (err instanceof Error && err.message === 'Not a member of this chat') {
      res.status(403).json({ error: err.message });
      return;
    }
    console.error('markSeen error:', err);
    res.status(500).json({ error: 'Failed to mark messages as seen' });
  }
}
