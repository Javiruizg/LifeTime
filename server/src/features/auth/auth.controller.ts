import type { Request, Response } from 'express';
import { deviceLoginSchema, refreshTokenSchema } from './auth.validation';
import { loginOrRegister, refreshAccessToken } from './auth.service';

export async function deviceAuthController(req: Request, res: Response) {
  try {
    const validation = deviceLoginSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: validation.error.flatten() 
      });
    }
    
    const { deviceId } = validation.data;
    const result = await loginOrRegister(deviceId);
    
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Device auth error:', error);
    
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function refreshTokenController(req: Request, res: Response) {
  try {
    const validation = refreshTokenSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: validation.error.flatten() 
      });
    }
    
    const { refreshToken } = validation.data;
    const result = await refreshAccessToken(refreshToken);
    
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    
    if (error instanceof Error && 
        (error.message === 'Invalid or expired refresh token' || 
         error.message === 'Invalid refresh token')) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    
    return res.status(500).json({ error: 'Internal server error' });
  }
}
