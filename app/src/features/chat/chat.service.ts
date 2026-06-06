import { api } from '../../shared/lib/api';
import type {
  PrivateChatResponse,
  PaginatedMessagesResponse,
  ChatMessage,
  MarkSeenResponse,
} from './chat.types';

export async function getOrCreatePrivateChat(userId: number): Promise<PrivateChatResponse> {
  const response = await api.post<PrivateChatResponse>(`/chat/private/${userId}`);
  return response.data;
}

export async function getMessages(
  chatId: number,
  limit = 50,
  cursor?: number
): Promise<PaginatedMessagesResponse> {
  const response = await api.get<PaginatedMessagesResponse>(`/chat/${chatId}/messages`, {
    params: { limit, cursor },
  });
  return response.data;
}

export async function sendMessageRest(chatId: number, content: string): Promise<ChatMessage> {
  const response = await api.post<ChatMessage>(`/chat/${chatId}/messages`, { content });
  return response.data;
}

export async function markMessagesAsSeen(chatId: number): Promise<MarkSeenResponse> {
  const response = await api.put<MarkSeenResponse>(`/chat/${chatId}/seen`);
  return response.data;
}
