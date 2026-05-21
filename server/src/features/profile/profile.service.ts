import { prisma } from '../../shared/lib/prisma';
import type { ProfileResponse, UpdateProfileInput } from './profile.types';

export class ProfileService {
  async getMyProfile(userId: number): Promise<ProfileResponse> {
    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new Error('Profile not found');
    }

    return {
      id: profile.id,
      userId: profile.userId,
      name: profile.name,
      message: profile.message,
      imageUrl: profile.imageUrl,
    };
  }

  async updateProfile(userId: number, data: UpdateProfileInput): Promise<ProfileResponse> {
    const profile = await prisma.profile.update({
      where: { userId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.message !== undefined && { message: data.message }),
      },
    });
    console.log('Updated profile for userId: ', userId);
    return {
      id: profile.id,
      userId: profile.userId,
      name: profile.name,
      message: profile.message,
      imageUrl: profile.imageUrl,
    };
  }
}
