import { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
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
import { Feather } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { getLocationStatus, disconnectFromLocation } from '../features/location/location.api';
import { startSharing, stopSharing } from '../features/location/location.socket.service';
import { getSocket } from '../shared/lib/socket';
import { getMyProfile } from '../features/profile/profile.service';
import type { Profile } from '../features/profile/profile.types';
import type { VisibleUserPayload } from '../features/location/location.types';
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

export default function ConnectedMapScreen({ navigation }: ConnectedMapScreenProps) {
  const mapRef = useRef<MapView>(null);
  const isActiveRef = useRef(true);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [otherUsers, setOtherUsers] = useState<VisibleUserPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSessionExpired = useCallback(async () => {
    if (!isActiveRef.current) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    Alert.alert('Session expired', 'You have been disconnected from the map.', [
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

  useEffect(() => {
    isActiveRef.current = true;

    const initialize = async () => {
      setLoading(true);
      setError(null);

      try {
        // 1. Load cached profile instantly
        try {
          const cachedProfile = await SecureStore.getItemAsync(CACHE_KEYS.profile);
          if (cachedProfile) {
            setProfile(JSON.parse(cachedProfile));
          }
        } catch { /* ignore cache read errors */ }

        // 2. Refresh profile in background
        try {
          const profileData = await getMyProfile();
          if (!isActiveRef.current) return;
          setProfile(profileData);
          await SecureStore.setItemAsync(CACHE_KEYS.profile, JSON.stringify(profileData));
        } catch { /* ignore network errors, keep cached profile */ }

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
        });

        // 7. Listen for session expiry
        getSocket()?.on('location:session_expired', () => {
          if (!isActiveRef.current) return;
          handleSessionExpired();
        });
      } catch (err) {
        if (isActiveRef.current) {
          setError('Failed to initialize connected map. Please try again.');
        }
      } finally {
        if (isActiveRef.current) {
          setLoading(false);
        }
      }
    };

    initialize();

    return () => {
      isActiveRef.current = false;
      getSocket()?.off('location:users');
      getSocket()?.off('location:session_expired');
      stopSharing();
    };
  }, [navigation, handleSessionExpired]);

  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

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
      />

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
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
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
