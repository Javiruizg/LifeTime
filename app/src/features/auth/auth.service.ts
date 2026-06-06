import * as SecureStore from 'expo-secure-store';
import { api } from '../../shared/lib/api';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_ID_KEY = 'userId';
const DEVICE_ID_KEY = 'user_device_id';

export interface AuthResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  userId: number;
  isNewUser: boolean;
}

export async function loginOrRegister(deviceId: string): Promise<AuthResponse> {
  const { api: axiosApi } = await import('../../shared/lib/api');

  console.log('Attempting to authenticate with device ID');
  const response = await axiosApi.post<AuthResponse>('/auth/device', {
    deviceId,
  });

  const { accessToken, refreshToken, userId } = response.data;

  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  await SecureStore.setItemAsync(USER_ID_KEY, String(userId));

  return response.data;
}

export async function refreshAccessToken(): Promise<void> {
  console.log('Attempting to refresh access token');
  const { api: axiosApi } = await import('../../shared/lib/api');

  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);

  if (!refreshToken) {
    // It should never happen this but just in case, if we don't have a refresh token, we log out the user to clear any potentially invalid tokens
    console.error('No refresh token available for refreshing access token');
    logout();
    throw new Error('No refresh token available');
  }

  const response = await axiosApi.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
    refreshToken,
  });

  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, response.data.accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, response.data.refreshToken);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function getUserId(): Promise<number | null> {
  const raw = await SecureStore.getItemAsync(USER_ID_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function logout(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_ID_KEY);
}

export async function reloginWithDeviceId(): Promise<string> {
  console.log('Attempting to re-login with device ID');
  const deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!deviceId) {
    console.error('No device ID found for re-login');
    throw new Error('No device ID available for relogin');
  }
  await loginOrRegister(deviceId);
  const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  if (!token) {
    throw new Error('Re-login failed: no access token');
  }
  return token;
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}