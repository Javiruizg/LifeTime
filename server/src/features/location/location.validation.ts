import { z } from 'zod';

export const connectLocationSchema = z.object({
  range: z.union([z.literal(500), z.literal(1000), z.literal(2000)]),
  durationMinutes: z.union([z.literal(30), z.literal(60), z.literal(120)]),
});

export type ConnectLocationInput = z.infer<typeof connectLocationSchema>;
