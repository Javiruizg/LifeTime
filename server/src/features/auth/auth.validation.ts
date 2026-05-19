import { z } from 'zod';

export const deviceLoginSchema = z.object({
  deviceId: z.string().min(1, 'deviceId is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

export type DeviceLoginInput = z.infer<typeof deviceLoginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
