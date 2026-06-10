export interface GroupCreationCandidate {
  userId: number;
  latitude: number;
  longitude: number;
  distance: number;
}

export interface GroupPayload {
  chatId: number;
  name: string;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  membersCount: number;
  hasUnread: boolean;
}

export interface GroupNearbyResponse {
  chatId: number;
  name: string;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  membersCount: number;
  hasUnread: boolean;
}

export interface GroupCreatedPayload {
  chatId: number;
  name: string;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  members: number[];
}

export interface GroupDeletedPayload {
  chatId: number;
  reason: 'underflow';
}

export interface GroupJoinedPayload {
  chatId: number;
  userId: number;
}

export interface JoinGroupInput {
  chatId: number;
}

export interface NearbyGroupsQuery {
  lat: number;
  lng: number;
  radius: number;
}
