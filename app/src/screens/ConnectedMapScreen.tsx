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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { getLocationStatus, disconnectFromLocation } from '../features/location/location.api';
import { startSharing, stopSharing } from '../features/location/location.socket.service';
import { getSocket } from '../shared/lib/socket';
import { getMyProfile } from '../features/profile/profile.service';
import type { Profile } from '../features/profile/profile.types';
import type { VisibleUserPayload, NearbyGroup, ConnectedFriendPayload, LocationUsersPayload } from '../features/location/location.types';
import { getOrCreatePrivateChat } from '../features/chat/chat.service';
import { joinGroup } from '../features/group/group.service';
import { onNearbyGroups, onGroupCreated, onGroupDeleted } from '../features/group/group.socket.service';
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
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const isActiveRef = useRef(true);
  const hasProfileRef = useRef(false);
  const hasLocationRef = useRef(false);
  const hasUsersRef = useRef(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [otherUsers, setOtherUsers] = useState<(VisibleUserPayload & { isFriend?: boolean })[]>([]);
  const [nearbyGroups, setNearbyGroups] = useState<NearbyGroup[]>([]);
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
    
    setOtherUsers((prevUsers) =>
      prevUsers.map((u) =>
        u.userId === userId ? { ...u, hasUnread: false } : u
      )
    );

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

  const handleGroupPress = useCallback(async (chatId: number) => {
    try {
      await joinGroup(chatId);
      
      setNearbyGroups((prevGroups) =>
        prevGroups.map((g) =>
          g.chatId === chatId ? { ...g, hasUnread: false } : g
        )
      );

      const group = nearbyGroups.find((g) => g.chatId === chatId);
      navigation.navigate('Chat', {
        chatId: chatId,
        otherUserId: 0, // Not used for groups
        otherUserName: group?.name ?? 'Group chat',
        otherUserImageUrl: group?.imageUrl ?? null,
        isGroup: true,
      });
    } catch (err) {
      Alert.alert('Error', 'Could not join group chat. The group may have been deleted.');
      // Remove stale group from local state so it disappears from the map
      setNearbyGroups((prevGroups) => prevGroups.filter((g) => g.chatId !== chatId));
    }
  }, [navigation, nearbyGroups]);

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

    const handleLocationUsers = (payload: LocationUsersPayload) => {
      if (!isActiveRef.current) return;

      const { users: serverUsers, friends: serverFriends } = payload;

      setOtherUsers((prevLocalUsers) => {
        const visibleUsers = serverUsers.map((serverUser) => {
          const localUser = prevLocalUsers.find((u) => u.userId === serverUser.userId);
          return {
            ...serverUser,
            hasUnread: serverUser.hasUnread || (localUser?.hasUnread ?? false),
            isFriend: false,
          };
        });

        const friendUsers = serverFriends.map((serverFriend) => {
          const localUser = prevLocalUsers.find((u) => u.userId === serverFriend.userId);
          return {
            userId: serverFriend.userId,
            latitude: serverFriend.latitude,
            longitude: serverFriend.longitude,
            distance: 0,
            profile: serverFriend.profile,
            hasUnread: serverFriend.hasUnread || (localUser?.hasUnread ?? false),
            isFriend: true,
          };
        });

        const merged = [...visibleUsers];
        friendUsers.forEach((friend) => {
          const existingIndex = merged.findIndex((u) => u.userId === friend.userId);
          if (existingIndex !== -1) {
            merged[existingIndex] = friend;
          } else {
            merged.push(friend);
          }
        });

        return merged;
      });

      if (!hasUsersRef.current) {
        hasUsersRef.current = true;
        maybeHideSpinner();
      }
    };

    const handleSessionExpiredEvent = () => {
      if (!isActiveRef.current) return;
      handleSessionExpired();
    };

    const handleLocationGroups = (groups: NearbyGroup[]) => {
      if (!isActiveRef.current) return;
      setNearbyGroups((prevLocalGroups) => {
        return groups.map((serverGroup) => {
          const localGroup = prevLocalGroups.find((g) => g.chatId === serverGroup.chatId);
          return {
            ...serverGroup,
            hasUnread: serverGroup.hasUnread || (localGroup?.hasUnread ?? false),
          };
        });
      });
    };

    const handleGroupCreated = (payload: { chatId: number; name: string; latitude: number; longitude: number; imageUrl: string | null; members: number[] }) => {
      if (!isActiveRef.current) return;
      setNearbyGroups((prev) => {
        if (prev.some((g) => g.chatId === payload.chatId)) return prev;
        return [...prev, {
          chatId: payload.chatId,
          name: payload.name,
          latitude: payload.latitude,
          longitude: payload.longitude,
          imageUrl: payload.imageUrl,
          membersCount: payload.members.length,
          hasUnread: false,
        }];
      });
    };

    const handleGroupDeleted = (payload: { chatId: number }) => {
      if (!isActiveRef.current) return;
      setNearbyGroups((prev) => {
        const filtered = prev.filter((g) => g.chatId !== payload.chatId);
        return filtered;
      });
    };

    const registerListeners = () => {
      const sock = getSocket();
      if (!sock) return;
      sock.off('location:users', handleLocationUsers);
      sock.on('location:users', handleLocationUsers);
      sock.off('location:session_expired', handleSessionExpiredEvent);
      sock.on('location:session_expired', handleSessionExpiredEvent);
      sock.off('location:groups', handleLocationGroups);
      sock.on('location:groups', handleLocationGroups);
      sock.off('group:created', handleGroupCreated);
      sock.on('group:created', handleGroupCreated);
      sock.off('group:deleted', handleGroupDeleted);
      sock.on('group:deleted', handleGroupDeleted);
    };

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
          //maybeHideSpinner();
        } catch { /* ignore network errors, keep cached profile */ }

        // If profile still not loaded, mark as attempted so spinner doesn't block forever
        if (!hasProfileRef.current) {
          hasProfileRef.current = true;
          //maybeHideSpinner();
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

        // 6-10. Register socket listeners (with reconnect safety)
        registerListeners();
        getSocket()?.on('connect', registerListeners);

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
      const sock = getSocket();
      if (sock) {
        sock.off('connect', registerListeners);
        sock.off('location:users', handleLocationUsers);
        sock.off('location:session_expired', handleSessionExpiredEvent);
        sock.off('location:groups', handleLocationGroups);
        sock.off('group:created', handleGroupCreated);
        sock.off('group:deleted', handleGroupDeleted);
      }
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
    isFriend: user.isFriend ?? false,
  }));

  const mappedNearbyGroups = nearbyGroups.map((group) => ({
    chatId: group.chatId,
    name: group.name,
    coordinate: {
      latitude: group.latitude,
      longitude: group.longitude,
    },
    imageUrl: group.imageUrl,
    membersCount: group.membersCount,
    hasUnread: group.hasUnread,
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
        nearbyGroups={mappedNearbyGroups}
        onUserPress={handleUserPress}
        onGroupPress={handleGroupPress}
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

      <TouchableOpacity
        style={styles.floatButtonRight}
        onPress={() => navigation.navigate('Social')}
        activeOpacity={0.75}
      >
        <View style={styles.floatButtonFallback}>
          <Feather name="users" size={22} color={theme.colors.text} />
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.disconnectButton, { bottom: insets.bottom > 0 ? insets.bottom + 10 : 40 }]}
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
