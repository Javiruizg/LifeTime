import { api } from '../../shared/lib/api';
import type { Profile, UpdateProfileInput } from './profile.types';

export async function getMyProfile(): Promise<Profile> {
  const response = await api.get<Profile>('/profile/me');
  return response.data;
}

export async function updateProfile(data: UpdateProfileInput): Promise<Profile> {
  const response = await api.put<Profile>('/profile/me', data);
  return response.data;
}
