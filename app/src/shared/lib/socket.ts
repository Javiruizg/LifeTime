import { io, Socket } from 'socket.io-client';
import {
  getAccessToken,
  refreshAccessToken,
  reloginWithDeviceId,
  logout,
} from '../../features/auth/auth.service';

const SOCKET_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3000';

let socket: Socket | null = null;
let isRefreshingToken = false;
let isIntentionalDisconnect = false;
let reconnectionAttempts = 0;

type AuthFailureListener = () => void;
const authFailureListeners: AuthFailureListener[] = [];

export function onSocketAuthFailure(listener: AuthFailureListener): () => void {
  authFailureListeners.push(listener);
  return () => {
    const index = authFailureListeners.indexOf(listener);
    if (index !== -1) {
      authFailureListeners.splice(index, 1);
    }
  };
}

function emitAuthFailure(): void {
  authFailureListeners.forEach((l) => l());
}

export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) {
    return socket;
  }

  if (socket) {
    socket.connect();
    return socket;
  }

  const token = await getAccessToken();
  if (!token) {
    throw new Error('No access token available');
  }

  isIntentionalDisconnect = false;
  reconnectionAttempts = 0;

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    timeout: 20000,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
  });

  socket.on('connect_error', async (err: Error) => {
    console.error('Socket connect error:', err.message);
    reconnectionAttempts++;

    if (isIntentionalDisconnect) {
      return;
    }

    if (!err.message.includes('token expired')) {
      if (reconnectionAttempts >= 5) {
        console.error('Socket reconnection failed after 5 attempts');
        socket?.disconnect();
        socket = null;
      }
      return;
    }

    if (isRefreshingToken) {
      return;
    }

    isRefreshingToken = true;

    try {
      await refreshAccessToken();
      const newToken = await getAccessToken();
      if (!newToken) {
        throw new Error('Token refresh succeeded but no token was stored');
      }
      socket!.auth = { token: newToken };
      socket!.connect();
    } catch (refreshError) {
      console.error('Token refresh failed, trying relogin:', refreshError);
      try {
        const newToken = await reloginWithDeviceId();
        socket!.auth = { token: newToken };
        socket!.connect();
      } catch (reloginError) {
        console.error('Relogin failed, logging out:', reloginError);
        await logout();
        emitAuthFailure();
      }
    } finally {
      isRefreshingToken = false;
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    if (reason === 'io server disconnect' && !isIntentionalDisconnect) {
      socket?.connect();
    }
  });

  return socket;
}

export function disconnectSocket(): void {
  isIntentionalDisconnect = true;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}
