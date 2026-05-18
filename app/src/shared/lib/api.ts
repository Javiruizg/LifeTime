import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { refreshAccessToken, logout, reloginWithDeviceId } from '../../features/auth/auth.service';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const ACCESS_TOKEN_KEY = 'accessToken';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown | null, token?: string) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (!error.response || error.response.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (originalRequest.url?.includes('/auth/refresh')) {
      await logout();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    // If a token refresh is already in progress, queue the request until it's done
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          },
          reject: (err) => {
            reject(err);
          },
        });
      });
    }

    // The first request that triggers the refresh will set isRefreshing to true and attempt to refresh the token
    isRefreshing = true;

    try {
      await refreshAccessToken();

      const newAccessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      const token = newAccessToken || '';

      processQueue(null, token);

      originalRequest.headers.Authorization = `Bearer ${token}`;
      return api(originalRequest);
    } catch (refreshError) {
      try {
        const token = await reloginWithDeviceId();

        processQueue(null, token);

        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      } catch {
        processQueue(refreshError);
        await logout();
        return Promise.reject(refreshError);
      }
    } finally {
      isRefreshing = false;
    }
  }
);