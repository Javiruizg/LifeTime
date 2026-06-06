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

export interface ChatMessage {
  id: number;
  chatId: number;
  senderId: number;
  content: string;
  seen: boolean;
  sentAt: string;
}

export interface PaginatedMessagesResponse {
  messages: ChatMessage[];
  nextCursor: number | null;
  hasMore: boolean;
}

export interface MarkSeenResponse {
  updatedCount: number;
}
