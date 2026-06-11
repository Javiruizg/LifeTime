import { api } from '../../shared/lib/api';
import type {
  Friend,
  FriendRequest,
  FriendStatus,
} from './friends.types';

export async function sendFriendRequest(userId: number): Promise<void> {
  await api.post('/friends/request', { receiverId: userId });
}

export async function cancelFriendRequest(userId: number): Promise<void> {
  await api.delete(`/friends/request/${userId}`);
}

export async function acceptFriendRequest(requestId: number): Promise<void> {
  await api.post(`/friends/accept/${requestId}`);
}

export async function rejectFriendRequest(requestId: number): Promise<void> {
  await api.post(`/friends/reject/${requestId}`);
}

export async function removeFriend(friendId: number): Promise<void> {
  await api.delete(`/friends/${friendId}`);
}

export async function getFriends(): Promise<Friend[]> {
  const response = await api.get<Friend[]>('/friends');
  return response.data;
}

export async function getReceivedRequests(): Promise<FriendRequest[]> {
  const response = await api.get<FriendRequest[]>('/friends/requests');
  return response.data;
}

export async function getFriendStatus(userId: number): Promise<FriendStatus> {
  const response = await api.get<FriendStatus>(`/friends/status/${userId}`);
  return response.data;
}
