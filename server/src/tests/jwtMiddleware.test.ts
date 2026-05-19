const JWT_SECRET = 'test_secret_key';
process.env.JWT_SECRET = JWT_SECRET;

import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateJWT } from '../shared/middleware/jwtAuth';
import type { AuthenticatedRequest } from '../shared/types/auth';

describe('authenticateJWT Middleware', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction = jest.fn();

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    nextFunction = jest.fn();
  });

  it('should allow access if the token is valid', () => {
    const token = jwt.sign({ userId: 42, type: 'access' }, JWT_SECRET);
    mockRequest.headers = { authorization: `Bearer ${token}` };

    authenticateJWT(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    expect(mockRequest.user).toEqual({ id: 42 });
  });

  it('should return 401 if the Authorization header is missing', () => {
    mockRequest.headers = {};

    authenticateJWT(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Unauthorized: missing or invalid token',
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 401 if a refresh token is used', () => {
    const token = jwt.sign({ userId: 42, type: 'refresh' }, JWT_SECRET);
    mockRequest.headers = { authorization: `Bearer ${token}` };

    authenticateJWT(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Unauthorized: invalid token type',
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 401 if the token has expired', () => {
    const token = jwt.sign({ userId: 42, exp: Math.floor(Date.now() / 1000) - 10 }, JWT_SECRET);
    mockRequest.headers = { authorization: `Bearer ${token}` };

    authenticateJWT(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Unauthorized: invalid or expired token',
    });
  });
});