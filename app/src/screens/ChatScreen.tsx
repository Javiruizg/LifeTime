import { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { getMessages, sendMessageRest } from '../features/chat/chat.service';
import {
  joinChat,
  leaveChat,
  sendMessageSocket,
  onChatMessage,
  onChatSeen,
  markSeenSocket,
} from '../features/chat/chat.socket.service';
import type { ChatMessage } from '../features/chat/chat.types';
import { getSocket } from '../shared/lib/socket';
import { theme } from '../shared/lib/theme';

type ChatScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Chat'>;

interface ChatScreenProps {
  navigation: ChatScreenNavigationProp;
  route: {
    params: {
      chatId: number;
      otherUserId: number;
      otherUserName: string;
      otherUserImageUrl?: string | null;
    };
  };
}

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3000';
const DEFAULT_AVATAR = '/defaults/default-avatar.png';

const getImageUrl = (imageUrl: string | null | undefined): string => {
  if (!imageUrl || imageUrl.trim() === '') {
    return `${SERVER_URL}${DEFAULT_AVATAR}`;
  }
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${SERVER_URL}${imageUrl}`;
};

export default function ChatScreen({ navigation, route }: ChatScreenProps) {
  const { chatId, otherUserId, otherUserName, otherUserImageUrl } = route.params;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [myUserId, setMyUserId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const isActiveRef = useRef(true);

  // Determine my userId from socket auth or store
  useEffect(() => {
    const socket = getSocket();
    if (socket?.auth && typeof socket.auth === 'object') {
      // We can't get userId directly from socket.auth easily, but we can try to decode JWT
      // For now, we infer it from messages: first message where senderId matches me
      // Actually, we don't strictly need myUserId stored if we can infer from the server
      // Let's use a simpler approach: messages from otherUserId are "other", everything else is "me"
      setMyUserId(-1); // sentinel, we will infer from messages
    }
  }, []);

  // Load initial messages
  const loadMessages = useCallback(async (cursor?: number) => {
    try {
      const result = await getMessages(chatId, 50, cursor);
      if (!isActiveRef.current) return;

      if (cursor) {
        // Prepend older messages
        setMessages((prev) => [...result.messages.reverse(), ...prev]);
      } else {
        setMessages(result.messages.reverse());
      }
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
    } catch (err) {
      if (!isActiveRef.current) return;
      setError('Failed to load messages');
    } finally {
      if (!isActiveRef.current) return;
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [chatId]);

  useEffect(() => {
    isActiveRef.current = true;
    setIsLoading(true);
    loadMessages();

    // Join chat room
    joinChat(chatId);

    // Mark messages as seen when opening
    markSeenSocket(chatId);

    const unsubscribeMessage = onChatMessage((message) => {
      if (!isActiveRef.current) return;
      setMessages((prev) => [...prev, message]);
      // Auto-mark as seen when receiving while in chat
      if (message.senderId !== myUserId && message.senderId !== -1) {
        markSeenSocket(chatId);
      }
    });

    const unsubscribeSeen = onChatSeen((payload) => {
      if (!isActiveRef.current) return;
      if (payload.chatId !== chatId) return;
      // Mark all messages sent by me as seen
      setMessages((prev) =>
        prev.map((msg) =>
          msg.senderId !== payload.byUserId ? { ...msg, seen: true } : msg
        )
      );
    });

    return () => {
      isActiveRef.current = false;
      leaveChat(chatId);
      unsubscribeMessage();
      unsubscribeSeen();
    };
  }, [chatId, loadMessages, myUserId]);

  // Infer myUserId from first batch of messages
  useEffect(() => {
    if (messages.length > 0 && myUserId === -1) {
      const msgFromOther = messages.find((m) => m.senderId === otherUserId);
      if (msgFromOther) {
        const inferredMe = messages.find((m) => m.senderId !== otherUserId);
        if (inferredMe) {
          setMyUserId(inferredMe.senderId);
        }
      }
    }
  }, [messages, myUserId, otherUserId]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;

    // Optimistic update
    const optimisticMsg: ChatMessage = {
      id: -Date.now(),
      chatId,
      senderId: myUserId ?? -1,
      content: text,
      seen: false,
      sentAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setInputText('');

    // Send via socket
    sendMessageSocket(chatId, text);

    // Fallback: if socket fails, send via REST
    // (the socket error handler will manage this, but for simplicity we rely on socket)
  }, [inputText, chatId, myUserId]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || !nextCursor) return;
    setIsLoadingMore(true);
    loadMessages(nextCursor);
  }, [hasMore, isLoadingMore, nextCursor, loadMessages]);

  const renderMessage = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
    const isMe = item.senderId !== otherUserId;
    const isLastMessage = index === messages.length - 1;
    const showSeen = isMe && isLastMessage && item.seen;

    return (
      <View style={[styles.messageRow, isMe ? styles.rowRight : styles.rowLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={[styles.messageText, isMe ? styles.textMe : styles.textOther]}>
            {item.content}
          </Text>
        </View>
        {showSeen && (
          <Text style={styles.seenText}>Seen</Text>
        )}
      </View>
    );
  }, [messages.length, otherUserId]);

  const keyExtractor = useCallback((item: ChatMessage) => String(item.id), []);

  const content = (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Image
          source={{ uri: getImageUrl(otherUserImageUrl) }}
          style={styles.headerAvatar}
        />
        <Text style={styles.headerName} numberOfLines={1}>
          {otherUserName}
        </Text>
      </View>

      {/* Messages */}
      {isLoading && messages.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={isLoadingMore ? (
            <ActivityIndicator style={styles.loadMore} color={theme.colors.primary} />
          ) : null}
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
          }}
        />
      )}

      {/* Input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor={theme.colors.textMuted}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim()}
        >
          <Feather name="send" size={20} color={inputText.trim() ? '#000' : theme.colors.textMuted} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  if (error && messages.length === 0) {
    return (
      <LinearGradient
        colors={[theme.colors.surface, theme.colors.background]}
        style={styles.container}
      >
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="light-content" />
          <View style={styles.errorRoot}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.errorButton} onPress={() => navigation.goBack()}>
              <Text style={styles.errorButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[theme.colors.surface, theme.colors.background]}
      style={styles.container}
    >
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        {content}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 8 : 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: 'rgba(30, 41, 59, 0.85)', // semi-transparent surface over gradient
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceAlt,
  },
  headerName: {
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messageRow: {
    marginVertical: 4,
  },
  rowLeft: {
    alignItems: 'flex-start',
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleMe: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: theme.colors.surfaceAlt,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: 22,
  },
  textMe: {
    color: '#000',
  },
  textOther: {
    color: theme.colors.text,
  },
  seenText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
    marginTop: 2,
    marginRight: 4,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: 'rgba(30, 41, 59, 0.85)', // semi-transparent surface over gradient
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.base,
    maxHeight: 120,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.surfaceAlt,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMore: {
    marginVertical: 8,
  },
  errorRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  errorText: {
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.base,
    textAlign: 'center',
  },
  errorButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  errorButtonText: {
    color: '#000',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
  },
});
