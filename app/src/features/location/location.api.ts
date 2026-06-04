import { api } from '../../shared/lib/api';
import type {
  ConnectLocationInput,
  ConnectLocationResponse,
  LocationSession,
} from './location.types';

export async function connectToLocation(
  data: ConnectLocationInput
): Promise<ConnectLocationResponse> {
  const response = await api.post<ConnectLocationResponse>('/location/connect', data);
  return response.data;
}

export async function disconnectFromLocation(): Promise<void> {
  await api.post('/location/disconnect');
}

export async function getLocationStatus(): Promise<LocationSession> {
  const response = await api.get<LocationSession>('/location/status');
  return response.data;
}
