import { z } from 'zod';

export const sendFriendRequestSchema = z.object({
  receiverId: z.number().int().positive(),
});

export const receiverIdParamsSchema = z.object({
  receiverId: z.string().regex(/^\d+$/).transform(Number),
});

export const requestIdParamsSchema = z.object({
  requestId: z.string().regex(/^\d+$/).transform(Number),
});

export const friendIdParamsSchema = z.object({
  friendId: z.string().regex(/^\d+$/).transform(Number),
});

export const userIdParamsSchema = z.object({
  userId: z.string().regex(/^\d+$/).transform(Number),
});

export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>;
export type ReceiverIdParams = z.infer<typeof receiverIdParamsSchema>;
export type RequestIdParams = z.infer<typeof requestIdParamsSchema>;
export type FriendIdParams = z.infer<typeof friendIdParamsSchema>;
export type UserIdParams = z.infer<typeof userIdParamsSchema>;
