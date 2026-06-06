import { getSocket } from '../../shared/lib/socket';
import type { ChatMessage } from './chat.types';

export function joinChat(chatId: number): void {
  getSocket()?.emit('chat:join', { chatId });
}

export function leaveChat(chatId: number): void {
  getSocket()?.emit('chat:leave', { chatId });
}

export function sendMessageSocket(chatId: number, content: string): void {
  getSocket()?.emit('chat:send', { chatId, content });
}

export function markSeenSocket(chatId: number): void {
  getSocket()?.emit('chat:seen', { chatId });
}

export function onChatMessage(callback: (message: ChatMessage) => void): () => void {
  const socket = getSocket();
  if (!socket) {
    return () => {};
  }
  socket.on('chat:message', callback);
  return () => {
    socket.off('chat:message', callback);
  };
}

export function onChatSeen(callback: (payload: { chatId: number; byUserId: number }) => void): () => void {
  const socket = getSocket();
  if (!socket) {
    return () => {};
  }
  socket.on('chat:seen', callback);
  return () => {
    socket.off('chat:seen', callback);
  };
}

export function onChatError(callback: (payload: { error: string }) => void): () => void {
  const socket = getSocket();
  if (!socket) {
    return () => {};
  }
  socket.on('chat:error', callback);
  return () => {
    socket.off('chat:error', callback);
  };
}
