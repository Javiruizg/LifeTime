import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    deviceId: string;
  };
}

/**
 * HTTP middleware that validates a device token from the Authorization header
 * (Bearer <token>) or x-device-token header. Looks up the user in Prisma
 * and attaches it to req.user.
 */

// TODO: Review this, I think this file will be removed when the proper middleware for validating access tokens is implemented
export async function authenticateDeviceToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const deviceHeader = req.headers['x-device-token'] as string | undefined;

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : deviceHeader;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: missing device token' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { deviceId: token },
      select: { id: true, deviceId: true },
    });

    if (!user) {
      res.status(401).json({ error: 'Unauthorized: invalid device token' });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
