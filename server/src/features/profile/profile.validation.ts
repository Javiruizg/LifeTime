import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name must have at least 1 character').max(20, 'Name must be 20 characters or less').optional(),
  message: z.string().max(50, 'Message must be 50 characters or less').optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
