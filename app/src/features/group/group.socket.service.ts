import { getSocket } from '../../shared/lib/socket';
import type { NearbyGroup } from '../../features/location/location.types';

export function onGroupCreated(callback: (payload: {
  chatId: number;
  name: string;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  members: number[];
}) => void): () => void {
  const socket = getSocket();
  if (!socket) return () => {};

  socket.on('group:created', callback);
  return () => {
    socket.off('group:created', callback);
  };
}

export function onGroupDeleted(callback: (payload: {
  chatId: number;
  reason: 'underflow';
}) => void): () => void {
  const socket = getSocket();
  if (!socket) return () => {};

  socket.on('group:deleted', callback);
  return () => {
    socket.off('group:deleted', callback);
  };
}

export function onGroupJoined(callback: (payload: {
  chatId: number;
  userId: number;
}) => void): () => void {
  const socket = getSocket();
  if (!socket) return () => {};

  socket.on('group:joined', callback);
  return () => {
    socket.off('group:joined', callback);
  };
}

export function onNearbyGroups(callback: (groups: NearbyGroup[]) => void): () => void {
  const socket = getSocket();
  if (!socket) return () => {};

  socket.on('location:groups', callback);
  return () => {
    socket.off('location:groups', callback);
  };
}
