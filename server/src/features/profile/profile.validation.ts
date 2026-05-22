import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name must have at least 1 character').max(25, 'Name must be 25 characters or less').optional(),
  message: z.string().max(255, 'Message must be 255 characters or less').optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
