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

/* ------------------------------------------------------------------ */
/*  Simple event emitter for auth failures                              */
/* ------------------------------------------------------------------ */

type AuthFailureListener = () => void;
const authFailureListeners: AuthFailureListener[] = [];

/**
 * Register a listener that fires when the socket exhausts all auth
 * recovery options (refresh → relogin → logout).
 * Returns an unsubscribe function.
 */
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

/* ------------------------------------------------------------------ */
/*  Socket lifecycle                                                     */
/* ------------------------------------------------------------------ */

export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) {
    return socket;
  }

  // If socket exists but is disconnected, reuse the instance
  if (socket) {
    socket.connect();
    return socket;
  }

  const token = await getAccessToken();
  if (!token) {
    throw new Error('No access token available');
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
  });

  socket.on('connect_error', async (err: Error) => {
    console.error('Socket connect error:', err.message);

    if (!err.message.includes('token expired')) {
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

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}
