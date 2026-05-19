import { Response, NextFunction } from 'express';
import { verifyAccessToken, TokenError } from '../lib/jwt';
import type { AuthenticatedRequest } from '../types/auth';

export function authenticateJWT(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: missing or invalid token' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = verifyAccessToken(token);
    req.user = { id: decoded.userId };
    next();
  } catch (err) {
    if (err instanceof TokenError) {
      if (err.code === 'TOKEN_EXPIRED') {
      res.status(401).json({ error: 'Unauthorized: invalid or expired token' });
        return;
      }
      if (err.code === 'INVALID_TYPE') {
        res.status(401).json({ error: 'Unauthorized: invalid token type' });
        return;
      }
    }
    res.status(401).json({ error: 'Unauthorized: missing or invalid token' });
  }
}