import { z } from 'zod';

export const nearbyGroupsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(100).max(5000).default(2000),
});

export const joinGroupParamsSchema = z.object({
  chatId: z.coerce.number().int().positive(),
});

export type NearbyGroupsQuery = z.infer<typeof nearbyGroupsQuerySchema>;
export type JoinGroupParams = z.infer<typeof joinGroupParamsSchema>;
