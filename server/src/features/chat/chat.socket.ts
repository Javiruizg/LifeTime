import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import {
  createMessage,
  markMessagesAsSeen,
  getOtherUserIdInChat,
} from './chat.service';

const sendMessageSchema = z.object({
  chatId: z.number().int().positive(),
  content: z.string().min(1).max(2000),
});

const joinLeaveSchema = z.object({
  chatId: z.number().int().positive(),
});

const seenSchema = z.object({
  chatId: z.number().int().positive(),
});

export function registerChatSocketHandlers(io: Server): void {
  io.on('connection', (socket) => {
    const userId = socket.data.userId as number;

    socket.on('chat:join', (payload) => {
      const parsed = joinLeaveSchema.safeParse(payload);
      if (!parsed.success) {
        console.warn('Invalid chat:join payload:', parsed.error);
        return;
      }
      socket.join(`chat:${parsed.data.chatId}`);
    });

    socket.on('chat:leave', (payload) => {
      const parsed = joinLeaveSchema.safeParse(payload);
      if (!parsed.success) {
        console.warn('Invalid chat:leave payload:', parsed.error);
        return;
      }
      socket.leave(`chat:${parsed.data.chatId}`);
    });

    socket.on('chat:send', async (payload) => {
      try {
        const parsed = sendMessageSchema.safeParse(payload);
        if (!parsed.success) {
          console.warn('Invalid chat:send payload:', parsed.error);
          return;
        }

        const { chatId, content } = parsed.data;
        const message = await createMessage(chatId, userId, content);

        // Emit to all members in the chat room (both sender and receiver are here when in ChatScreen)
        io.to(`chat:${chatId}`).emit('chat:message', message);

        // Also emit to the other user's personal room so they get it on the map / when not in chat
        const otherUserId = await getOtherUserIdInChat(chatId, userId);
        if (otherUserId) {
          console.log(`[chat:send] emitting chat:notification to user:${otherUserId} for chat:${chatId}`);
          io.to(`user:${otherUserId}`).emit('chat:notification', message);
        }
      } catch (error) {
        console.error('chat:send error:', error);
        socket.emit('chat:error', { error: 'Failed to send message' });
      }
    });

    socket.on('chat:seen', async (payload) => {
      try {
        const parsed = seenSchema.safeParse(payload);
        if (!parsed.success) {
          console.warn('Invalid chat:seen payload:', parsed.error);
          return;
        }

        const { chatId } = parsed.data;
        const result = await markMessagesAsSeen(chatId, userId);

        if (result.updatedCount > 0) {
          // Notify other user(s) in the chat that their messages have been seen
          io.to(`chat:${chatId}`).emit('chat:seen', {
            chatId,
            byUserId: userId,
          });

          const otherUserId = await getOtherUserIdInChat(chatId, userId);
          if (otherUserId) {
            io.to(`user:${otherUserId}`).emit('chat:seen', {
              chatId,
              byUserId: userId,
            });
          }
        }
      } catch (error) {
        console.error('chat:seen error:', error);
        socket.emit('chat:error', { error: 'Failed to mark messages as seen' });
      }
    });
  });
}
