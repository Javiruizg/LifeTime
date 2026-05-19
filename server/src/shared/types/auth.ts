import type { Request } from 'express';

export interface AuthenticatedUser {
  id: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export interface SocketData {
  userId: number;
}

export interface AccessTokenPayload {
  userId: number;
  type: 'access';
  iat?: number;
  exp?: number;
}
