import { z } from 'zod';

export const createPrivateChatParamsSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

export const chatIdParamsSchema = z.object({
  chatId: z.coerce.number().int().positive(),
});

export const getMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.coerce.number().int().optional(),
});

export const sendMessageBodySchema = z.object({
  content: z.string().min(1).max(2000),
});

export const joinLeaveBodySchema = z.object({
  chatId: z.number().int().positive(),
});

export const seenBodySchema = z.object({
  chatId: z.number().int().positive(),
});
