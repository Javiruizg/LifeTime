import jwt, { TokenExpiredError, JsonWebTokenError, NotBeforeError } from 'jsonwebtoken';
import type { AccessTokenPayload } from '../types/auth';

const JWT_SECRET = process.env.JWT_SECRET!;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not defined');
}

export class TokenError extends Error {
  constructor(
    message: string,
    public readonly code: 'TOKEN_MALFORMED' | 'TOKEN_EXPIRED' | 'INVALID_TYPE' | 'UNKNOWN',
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'TokenError';
  }
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;

    if (decoded.type !== 'access') {
      throw new TokenError('Invalid token type: expected access token', 'INVALID_TYPE');
    }

    return decoded;
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      throw new TokenError('Token has expired', 'TOKEN_EXPIRED', err);
    }
    if (err instanceof JsonWebTokenError) {
      throw new TokenError('Invalid or malformed token', 'TOKEN_MALFORMED', err);
    }
    if (err instanceof NotBeforeError) {
      throw new TokenError('Token not yet valid', 'TOKEN_MALFORMED', err);
    }
    if (err instanceof TokenError) {
      throw err;
    }
    throw new TokenError('Unexpected error during token verification', 'UNKNOWN', err as Error);
  }
}