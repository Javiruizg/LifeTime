import { z } from 'zod';

export const uploadProfileSchema = z.object({
  // No body fields; the image comes via multipart form-data
});

export type UploadProfileInput = z.infer<typeof uploadProfileSchema>;
