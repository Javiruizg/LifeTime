import { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Image,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { getLocationStatus, disconnectFromLocation } from '../features/location/location.api';
import { startSharing, stopSharing } from '../features/location/location.socket.service';
import { getSocket } from '../shared/lib/socket';
import { getMyProfile } from '../features/profile/profile.service';
import type { Profile } from '../features/profile/profile.types';
import type { VisibleUserPayload } from '../features/location/location.types';
import { getOrCreatePrivateChat } from '../features/chat/chat.service';
import { onChatNotification, shouldNotifyChat, clearChatNotification } from '../features/chat/chat.socket.service';
import type { ChatMessage } from '../features/chat/chat.types';
import { theme } from '../shared/lib/theme';
import LiveMap from '../components/LiveMap';

type ConnectedMapScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ConnectedMap'>;

interface ConnectedMapScreenProps {
  navigation: ConnectedMapScreenNavigationProp;
}

const CACHE_KEYS = {
  profile: 'profile_cache',
};

const DEFAULT_DELTA = 0.01;

const DEFAULT_REGION: Region = {
  latitude: 37.38,
  longitude: -5.99,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3000';
const DEFAULT_AVATAR = '/defaults/default-avatar.png';
const FLOAT_BUTTON_SIZE = 56;

const getImageUrl = (imageUrl: string | null): string => {
  if (!imageUrl || imageUrl.trim() === '') {
    return `${SERVER_URL}${DEFAULT_AVATAR}`;
  }
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${SERVER_URL}${imageUrl}`;
};

export default function ConnectedMapScreen({ navigation }: ConnectedMapScreenProps) {
  const mapRef = useRef<MapView>(null);
  const isActiveRef = useRef(true);
  const hasProfileRef = useRef(false);
  const hasLocationRef = useRef(false);
  const hasUsersRef = useRef(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [otherUsers, setOtherUsers] = useState<VisibleUserPayload[]>([]);
  const otherUsersRef = useRef(otherUsers);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    otherUsersRef.current = otherUsers;
  }, [otherUsers]);

  const maybeHideSpinner = useCallback(() => {
    if (!isActiveRef.current) return;
    if (hasProfileRef.current && hasLocationRef.current && hasUsersRef.current) {
      setIsInitializing(false);
    }
  }, []);

  const handleSessionExpired = useCallback(async () => {
    if (!isActiveRef.current) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    Alert.alert('Automatic disconnection', 'You have been disconnected from the map.', [
      { text: 'OK', onPress: () => navigation.replace('Home') },
    ]);
  }, [navigation]);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnectFromLocation();
    } catch {
      // Best-effort; server TTL will clean up anyway
    }
    stopSharing();
    await Notifications.cancelAllScheduledNotificationsAsync();
    navigation.replace('Home');
  }, [navigation]);

  const handleUserPress = useCallback(async (userId: number) => {
    try {
      const chat = await getOrCreatePrivateChat(userId);
      clearChatNotification(chat.chatId);
      const otherUser = otherUsers.find((u) => u.userId === userId);
      navigation.navigate('Chat', {
        chatId: chat.chatId,
        otherUserId: userId,
        otherUserName: otherUser?.profile?.name ?? chat.otherUser.name ?? 'Unknown',
        otherUserImageUrl: otherUser?.profile?.imageUrl ?? chat.otherUser.imageUrl ?? null,
      });
    } catch (err) {
      Alert.alert('Error', 'Could not open chat. Please try again.');
    }
  }, [navigation, otherUsers]);

  // Refresh profile whenever screen regains focus (e.g. after editing in ProfileScreen)
  useFocusEffect(
    useCallback(() => {
      const refreshProfile = async () => {
        try {
          const cachedProfile = await SecureStore.getItemAsync(CACHE_KEYS.profile);
          if (cachedProfile) {
            setProfile(JSON.parse(cachedProfile));
            hasProfileRef.current = true;
          }
        } catch { /* ignore cache read errors */ }

        try {
          const profileData = await getMyProfile();
          setProfile(profileData);
          await SecureStore.setItemAsync(CACHE_KEYS.profile, JSON.stringify(profileData));
          hasProfileRef.current = true;
        } catch { /* ignore network errors */ }
      };

      refreshProfile();
    }, [])
  );

  useEffect(() => {
    isActiveRef.current = true;
    let unsubscribeChatMessage: (() => void) | undefined;

    const initialize = async () => {
      setIsInitializing(true);
      setError(null);
      hasProfileRef.current = false;
      hasLocationRef.current = false;
      hasUsersRef.current = false;

      try {
        // 0. Load cached location immediately so map centers fast
        try {
          const cachedLocation = await SecureStore.getItemAsync('last_location_cache');
          if (cachedLocation) {
            const coords = JSON.parse(cachedLocation);
            if (!isActiveRef.current) return;
            setLocation(coords);
            hasLocationRef.current = true;
            maybeHideSpinner();
          }
        } catch { /* ignore cache read errors */ }

        // 1. Load cached profile instantly
        try {
          const cachedProfile = await SecureStore.getItemAsync(CACHE_KEYS.profile);
          if (cachedProfile) {
            if (!isActiveRef.current) return;
            setProfile(JSON.parse(cachedProfile));
            hasProfileRef.current = true;
            maybeHideSpinner();
          }
        } catch { /* ignore cache read errors */ }

        // 2. Refresh profile in background
        try {
          const profileData = await getMyProfile();
          if (!isActiveRef.current) return;
          setProfile(profileData);
          await SecureStore.setItemAsync(CACHE_KEYS.profile, JSON.stringify(profileData));
          hasProfileRef.current = true;
          maybeHideSpinner();
        } catch { /* ignore network errors, keep cached profile */ }

        // If profile still not loaded, mark as attempted so spinner doesn't block forever
        if (!hasProfileRef.current) {
          hasProfileRef.current = true;
          maybeHideSpinner();
        }

        // 3. Verify active session
        const status = await getLocationStatus();
        if (!isActiveRef.current) return;

        if (!status.active) {
          navigation.replace('Home');
          return;
        }

        // 4. Start sharing location + get coordinates for UI
        await startSharing((coords) => {
          if (!isActiveRef.current) return;
          setLocation(coords);
          mapRef.current?.animateToRegion(
            { ...coords, latitudeDelta: DEFAULT_DELTA, longitudeDelta: DEFAULT_DELTA },
            800
          );
          if (!hasLocationRef.current) {
            hasLocationRef.current = true;
            maybeHideSpinner();
          }
        });

        if (!isActiveRef.current) return;

        // 5. Schedule local notification for expiry
        if (status.expiresAt) {
          await Notifications.cancelAllScheduledNotificationsAsync();
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Disconnected from map',
              body: 'Your location sharing session has expired.',
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(status.expiresAt),
            },
          });
        }

        // 6. Listen for visible users
        getSocket()?.on('location:users', (users: VisibleUserPayload[]) => {
          if (!isActiveRef.current) return;
          setOtherUsers(users);
          // Clear notification block for users whose messages are now seen
          users.forEach((u) => {
            if (!u.hasUnread) {
              // We don't know the chatId here, but the server will clear it
              // when the user opens the chat. For now, we rely on the
              // location:users interval to update the red border.
            }
          });
          if (!hasUsersRef.current) {
            hasUsersRef.current = true;
            maybeHideSpinner();
          }
        });

        // 7. Listen for session expiry
        getSocket()?.on('location:session_expired', () => {
          if (!isActiveRef.current) return;
          handleSessionExpired();
        });

        // 8. Listen for incoming chat notifications and show local notifications
        unsubscribeChatMessage = onChatNotification((message: ChatMessage) => {
          console.log('[ConnectedMapScreen] chat:notification received:', message);
          if (!isActiveRef.current) return;
          // Update local state immediately to show red border on the map
          setOtherUsers((prev) =>
            prev.map((u) =>
              u.userId === message.senderId ? { ...u, hasUnread: true } : u
            )
          );
          // Only notify once per chat until the user opens it
          if (!shouldNotifyChat(message.chatId)) return;
          const sender = otherUsersRef.current.find((u) => u.userId === message.senderId);
          if (sender) {
            Notifications.scheduleNotificationAsync({
              content: {
                title: `You have new messages from ${sender.profile?.name ?? 'Unknown'}`,
                body: message.content,
                data: {
                  chatId: message.chatId,
                  otherUserId: message.senderId,
                  otherUserName: sender.profile?.name ?? 'Unknown',
                  otherUserImageUrl: sender.profile?.imageUrl ?? null,
                },
              },
              trigger: null,
            }).catch(() => {});
          }
        });

      } catch (err) {
        if (isActiveRef.current) {
          setError('Failed to initialize connected map. Please try again.');
          setIsInitializing(false);
        }
      }
    };

    initialize();

    return () => {
      isActiveRef.current = false;
      getSocket()?.off('location:users');
      getSocket()?.off('location:session_expired');
      unsubscribeChatMessage?.();
      stopSharing();
    };
  }, [navigation, handleSessionExpired, maybeHideSpinner]);

  if (error) {
    return (
      <View style={styles.errorRoot}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.errorButton} onPress={() => navigation.replace('Home')}>
          <Text style={styles.errorButtonText}>Go Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentUser = location && profile
    ? { profile, coordinate: location }
    : undefined;

  const mappedOtherUsers = otherUsers.map((user) => ({
    userId: user.userId,
    profile: user.profile ?? {
      id: 0,
      userId: user.userId,
      name: 'Unknown',
      message: '',
      imageUrl: null,
    },
    coordinate: {
      latitude: user.latitude,
      longitude: user.longitude,
    },
    hasUnread: user.hasUnread ?? false,
  }));

  const initialRegion = location
    ? { ...location, latitudeDelta: DEFAULT_DELTA, longitudeDelta: DEFAULT_DELTA }
    : DEFAULT_REGION;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <LiveMap
        ref={mapRef}
        initialRegion={initialRegion}
        currentUser={currentUser}
        otherUsers={mappedOtherUsers}
        onUserPress={handleUserPress}
      />

      {isInitializing && (
        <View style={styles.topLoader}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      )}

      <TouchableOpacity
        style={styles.floatButtonLeft}
        onPress={() => navigation.navigate('Profile')}
        activeOpacity={0.75}
      >
        <Image source={{ uri: `${SERVER_URL}${DEFAULT_AVATAR}` }} style={styles.floatButtonImg} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.floatButtonRight} activeOpacity={0.75}>
        {profile ? (
          <Image source={{ uri: getImageUrl(profile.imageUrl) }} style={styles.floatButtonImg} />
        ) : (
          <View style={styles.floatButtonFallback}>
            <Feather name="users" size={22} color={theme.colors.text} />
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.disconnectButton}
        onPress={handleDisconnect}
        activeOpacity={0.75}
      >
        <Feather name="log-out" size={20} color="#000" />
        <Text style={styles.disconnectText}>Disconnect</Text>
      </TouchableOpacity>
    </View>
  );
}

const DISCONNECT_BUTTON_HEIGHT = 48;

const styles = StyleSheet.create({
  errorRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
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
  root: {
    flex: 1,
    backgroundColor: '#0e1626',
  },
  floatButtonLeft: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 76 : 44,
    left: 20,
    width: FLOAT_BUTTON_SIZE,
    height: FLOAT_BUTTON_SIZE,
    borderRadius: FLOAT_BUTTON_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 6,
    borderColor: 'rgba(0, 0, 0, 1)',
    ...theme.shadows.md,
  },
  floatButtonRight: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 76 : 44,
    right: 20,
    width: FLOAT_BUTTON_SIZE,
    height: FLOAT_BUTTON_SIZE,
    borderRadius: FLOAT_BUTTON_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 6,
    borderColor: 'rgba(0, 0, 0, 1)',
    ...theme.shadows.md,
  },
  floatButtonImg: {
    width: '100%',
    height: '100%',
  },
  floatButtonFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topLoader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 88 : 56,
    alignSelf: 'center',
    zIndex: 100,
  },
  disconnectButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20,
    height: DISCONNECT_BUTTON_HEIGHT,
    borderRadius: DISCONNECT_BUTTON_HEIGHT / 2,
    ...theme.shadows.md,
  },
  disconnectText: {
    color: '#000',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
  },
});
