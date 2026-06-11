import { getSocket } from '../../shared/lib/socket';
import type {
  FriendRequestReceivedPayload,
  FriendRequestAcceptedPayload,
  FriendRemovedPayload,
  FriendStatusChangedPayload,
} from './friends.types';

export function onFriendRequestReceived(
  callback: (payload: FriendRequestReceivedPayload) => void
): () => void {
  const socket = getSocket();
  if (!socket) {
    return () => {};
  }
  socket.on('friend:request_received', callback);
  return () => {
    socket.off('friend:request_received', callback);
  };
}

export function onFriendRequestAccepted(
  callback: (payload: FriendRequestAcceptedPayload) => void
): () => void {
  const socket = getSocket();
  if (!socket) {
    return () => {};
  }
  socket.on('friend:request_accepted', callback);
  return () => {
    socket.off('friend:request_accepted', callback);
  };
}

export function onFriendRemoved(
  callback: (payload: FriendRemovedPayload) => void
): () => void {
  const socket = getSocket();
  if (!socket) {
    return () => {};
  }
  socket.on('friend:removed', callback);
  return () => {
    socket.off('friend:removed', callback);
  };
}

export function onFriendStatusChanged(
  callback: (payload: FriendStatusChangedPayload) => void
): () => void {
  const socket = getSocket();
  if (!socket) {
    return () => {};
  }
  socket.on('friend:status_changed', callback);
  return () => {
    socket.off('friend:status_changed', callback);
  };
}
