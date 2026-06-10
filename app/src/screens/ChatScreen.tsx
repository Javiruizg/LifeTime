import { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  FlatList,
  Platform,
  ActivityIndicator,
  StatusBar as RNStatusBar,
  Keyboard,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { getMessages } from '../features/chat/chat.service';
import {
  joinChat,
  leaveChat,
  sendMessageSocket,
  onChatMessage,
  onChatSeen,
  markSeenSocket,
} from '../features/chat/chat.socket.service';
import type { ChatMessage } from '../features/chat/chat.types';
import { getUserId } from '../features/auth/auth.service';
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
      isGroup?: boolean;
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
  const { chatId, otherUserId, otherUserName, otherUserImageUrl, isGroup = false } = route.params;

  const insets = useSafeAreaInsets();

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
  const keyboardTranslate = useRef(new Animated.Value(0)).current;
  const inputBarHeightRef = useRef(0);
  const [inputBarHeight, setInputBarHeight] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    // Guardamos el espacio inferior que ya tiene la barra
    const safePadding = insets.bottom > 0 ? insets.bottom : 10;

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const keyboardHeight = e.endCoordinates.height;
      
      // LA MAGIA: 
      // Al mantener el paddingBottom constante en el componente, la barra ya está elevada.
      // Para que quede a ras del teclado, le restamos ese padding a la animación.
      const translateDistance = Math.max(0, keyboardHeight ); //+ safePadding);
      
      const duration = Platform.OS === 'ios' ? (e.duration ?? 250) : 250;
      setIsKeyboardOpen(true);
      
      Animated.timing(keyboardTranslate, {
        toValue: translateDistance,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        requestAnimationFrame(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        });
      });
    });

    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      const duration = Platform.OS === 'ios' ? (e.duration ?? 250) : 250;
      setIsKeyboardOpen(false);
      Animated.timing(keyboardTranslate, {
        toValue: 0,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardTranslate, insets.bottom]);

  useEffect(() => {
    if (isLoading || messages.length === 0) return;
    const t = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: false });
    }, 50);
    return () => clearTimeout(t);
  }, [isLoading, messages.length > 0]);

  useEffect(() => {
    getUserId().then((id) => {
      if (id !== null) {
        setMyUserId(id);
      }
    });
  }, []);

  const loadMessages = useCallback(
    async (cursor?: number) => {
      try {
        const result = await getMessages(chatId, 50, cursor);
        if (!isActiveRef.current) return;

        if (cursor !== undefined) {
          setMessages((prev) => [...result.messages.reverse(), ...prev]);
        } else {
          setMessages(result.messages.reverse());
        }
        setHasMore(result.hasMore);
        setNextCursor(result.nextCursor);
      } catch {
        if (!isActiveRef.current) return;
        setError('Failed to load messages');
      } finally {
        if (!isActiveRef.current) return;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [chatId]
  );

  useEffect(() => {
    isActiveRef.current = true;
    setIsLoading(true);
    loadMessages();

    joinChat(chatId);
    markSeenSocket(chatId);

    const unsubscribeMessage = onChatMessage((message) => {
      if (!isActiveRef.current) return;

      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;

        const optimisticIndex = prev.findIndex(
          (m) => m.id < 0 && m.senderId === message.senderId && m.content === message.content
        );

        if (optimisticIndex !== -1) {
          const updated = [...prev];
          updated[optimisticIndex] = message;
          return updated;
        }

        return [...prev, message];
      });

      if (!isGroup && message.senderId !== myUserId && message.senderId !== -1) {
        markSeenSocket(chatId);
      }
    });

    const unsubscribeSeen = onChatSeen((payload) => {
      if (!isActiveRef.current) return;
      if (payload.chatId !== chatId) return;
      if (isGroup) return;

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

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;

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
    sendMessageSocket(chatId, text);
  }, [inputText, chatId, myUserId]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || nextCursor == null) return;
    setIsLoadingMore(true);
    loadMessages(nextCursor);
  }, [hasMore, isLoadingMore, nextCursor, loadMessages]);

  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      const isMe = isGroup
        ? item.senderId === myUserId
        : item.senderId !== otherUserId;
      const isLastMessage = index === messages.length - 1;
      const showSeen = !isGroup && isMe && isLastMessage && item.seen;
      const senderProfile = item.senderProfile;

      return (
        <View style={[styles.messageRow, isMe ? styles.rowRight : styles.rowLeft]}>
          {!isMe && isGroup && (
            <Image
              source={{
                uri: senderProfile?.imageUrl
                  ? getImageUrl(senderProfile.imageUrl)
                  : getImageUrl(null),
              }}
              style={styles.senderAvatar}
            />
          )}
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
            {isGroup && !isMe && senderProfile && (
              <Text style={styles.senderName}>{senderProfile.name}</Text>
            )}
            <Text style={[styles.messageText, isMe ? styles.textMe : styles.textOther]}>
              {item.content}
            </Text>
          </View>
          {showSeen && <Text style={styles.seenText}>Seen</Text>}
        </View>
      );
    },
    [messages.length, otherUserId, myUserId, isGroup]
  );

  const keyExtractor = useCallback((item: ChatMessage) => String(item.id), []);

  if (error && messages.length === 0) {
    return (
      <LinearGradient colors={[theme.colors.surface, theme.colors.background]} style={styles.container}>
        <View style={styles.errorRoot}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.errorButton} onPress={() => navigation.goBack()}>
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[theme.colors.surface, theme.colors.background]} style={styles.container}>
      <RNStatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <View style={styles.screen}>
        <View style={[styles.headerWrapper, { paddingTop: insets.top }]}>
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
        </View>

        <View style={styles.listWrapper}>
          {isLoading && messages.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              style={styles.list}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={keyExtractor}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: inputBarHeight + 8 },
              ]}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.3}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              ListFooterComponent={
                isLoadingMore ? (
                  <ActivityIndicator style={styles.loadMore} color={theme.colors.primary} />
                ) : null
              }
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            />
          )}
        </View>

        <Animated.View
          style={[
            styles.inputBar,
            {
              paddingBottom: insets.bottom > 0 ? insets.bottom + 10: 10,
              transform: [{ translateY: Animated.multiply(keyboardTranslate, -1) }],
            },
          ]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (Math.abs(h - inputBarHeightRef.current) > 1) {
              inputBarHeightRef.current = h;
              setInputBarHeight(h);
            }
          }}
        >
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
            <Feather
              name="send"
              size={20}
              color={inputText.trim() ? '#000' : theme.colors.textMuted}
            />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  headerWrapper: {
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    padding: 4,
    minWidth: 32,
    minHeight: 32,
    justifyContent: 'center',
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
  listWrapper: {
    flex: 1,
    minHeight: 0,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    flexGrow: 1,
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
  senderAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    backgroundColor: theme.colors.surfaceAlt,
  },
  senderName: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.primary,
    fontWeight: '600',
    marginBottom: 4,
  },
  inputBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: '#1e293b',
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