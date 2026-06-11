export interface FriendProfile {
  id: number;
  name: string;
  imageUrl: string | null;
}

export interface Friend {
  id: number;
  userId: number;
  profile: FriendProfile;
  isOnline: boolean;
}

export interface FriendRequest {
  id: number;
  senderId: number;
  profile: FriendProfile;
  createdAt: string;
}

export interface FriendStatus {
  status: 'none' | 'friends' | 'pending_sent' | 'pending_received' | 'rejected';
  requestId?: number;
}

export interface FriendRequestReceivedPayload {
  requestId: number;
  senderId: number;
  senderName: string;
  senderImageUrl: string | null;
}

export interface FriendRequestAcceptedPayload {
  friendId: number;
  friendName: string;
  friendImageUrl: string | null;
}

export interface FriendRemovedPayload {
  friendId: number;
}

export interface FriendStatusChangedPayload {
  friendId: number;
  isOnline: boolean;
}
