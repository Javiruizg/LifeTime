import jwt, { type SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { prisma } from '../../shared/lib/prisma';
import { hashToken } from '../../shared/lib/hash';
import type { AuthTokens } from './auth.types';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_SECRET_REFRESH = process.env.JWT_SECRET_REFRESH!;
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '15m';
const REFRESH_TOKEN_EXPIRATION = process.env.REFRESH_TOKEN_EXPIRATION || '7d';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not defined');
}
if (!JWT_SECRET_REFRESH) {
  throw new Error('JWT_SECRET_REFRESH environment variable is not defined');
}


function generateAccessToken(userId: number): string {
  return jwt.sign({ userId, type:'access' }, JWT_SECRET, { expiresIn: JWT_EXPIRATION as SignOptions['expiresIn'] });
}

function generateRefreshToken(userId: number): string {
  return jwt.sign(
    { userId, type: 'refresh', jti: randomUUID() }, 
    JWT_SECRET_REFRESH, 
    { expiresIn: REFRESH_TOKEN_EXPIRATION as SignOptions['expiresIn'] }
  );
}

function verifyRefreshToken(token: string): { userId: number } {
  try {
    const decoded = jwt.verify(token, JWT_SECRET_REFRESH) as { userId: number; type: string };
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    
    return { userId: decoded.userId };
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
}

export async function loginOrRegister(deviceId: string): Promise<AuthTokens & { userId: number; isNewUser: boolean }> {
  console.log('Login/register request received');
  
  const hashedDeviceId = hashToken(deviceId);
  
  let user = await prisma.user.findUnique({
    where: { deviceId: hashedDeviceId },
  });
  
  const isNewUser = !user;
  
  if (isNewUser) {
    console.log(`New user detected, creating account...`);
    user = await prisma.user.create({
      data: {
        deviceId: hashedDeviceId,
        refreshToken: '',
        profile: {
          create: {
            name: 'Unnamed',
            imageUrl: '/defaults/default-avatar.png',
          },
        },
      },
    });
    console.log(`User created with ID: ${user.id}`);
  } else if (user) {
    console.log(`Existing user found, ID: ${user.id}, regenerating tokens...`);
  }
  
  if (!user) {
    throw new Error('Failed to create or find user');
  }
  
  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);
  
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: hashToken(refreshToken) },
  });
  
  console.log(`Refresh token updated in database for user ${user.id}`);

  return {
    accessToken,
    refreshToken,
    userId: user.id,
    isNewUser,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
  console.log(`Token refresh request received`);
  
  const { userId } = verifyRefreshToken(refreshToken);
  console.log(`Token verified for user ID: ${userId}`);
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  
  if (!user || user.refreshToken !== hashToken(refreshToken)) {
    console.error(`Invalid refresh token for user ${userId}`);
    throw new Error('Invalid refresh token');
  }
  
  console.log(`Old refresh token validated, generating new tokens...`);
  
  const newAccessToken = generateAccessToken(user.id);
  const newRefreshToken = generateRefreshToken(user.id);
  
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: hashToken(newRefreshToken) },
  });
  
  console.log(`New refresh token stored in database for user ${user.id}`);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}
