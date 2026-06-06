export interface ChatMessage {
  id: number;
  chatId: number;
  senderId: number;
  content: string;
  seen: boolean;
  sentAt: Date;
}

export interface ChatMessageResponse {
  id: number;
  chatId: number;
  senderId: number;
  content: string;
  seen: boolean;
  sentAt: string;
}

export interface ChatPartnerProfile {
  id: number;
  userId: number;
  name: string;
  imageUrl: string | null;
}

export interface PrivateChatResponse {
  chatId: number;
  otherUser: ChatPartnerProfile;
}

export interface PaginatedMessagesResponse {
  messages: ChatMessageResponse[];
  nextCursor: number | null;
  hasMore: boolean;
}

export interface MarkSeenResponse {
  updatedCount: number;
}

export interface SendMessagePayload {
  chatId: number;
  content: string;
}

export interface JoinLeavePayload {
  chatId: number;
}

export interface SeenPayload {
  chatId: number;
}
