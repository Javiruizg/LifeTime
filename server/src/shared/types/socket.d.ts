import type { Server } from 'socket.io';
import type { SocketData } from './auth';

declare module 'socket.io' {
  interface Server {
    emit(event: 'auth:error', payload: { code: string; message: string }): this;
  }
}

export {};