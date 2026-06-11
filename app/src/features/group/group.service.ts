import { api } from '../../shared/lib/api';
import type { NearbyGroup } from '../../features/location/location.types';

export async function getNearbyGroups(
  lat: number,
  lng: number,
  radius: number = 2000
): Promise<{ groups: NearbyGroup[] }> {
  const response = await api.get<{ groups: NearbyGroup[] }>('/group/nearby', {
    params: { lat, lng, radius },
  });
  return response.data;
}

export async function joinGroup(chatId: number): Promise<{ success: boolean; message: string }> {
  const response = await api.post<{ success: boolean; message: string }>(`/group/${chatId}/join`);
  return response.data;
}
