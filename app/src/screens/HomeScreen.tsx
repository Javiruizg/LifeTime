import { useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  Platform,
  StatusBar,
  Text,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { getMyProfile } from '../features/profile/profile.service';
import type { Profile } from '../features/profile/profile.types';
import { theme } from '../shared/lib/theme';
import LiveMap from '../components/LiveMap';
import ConnectModal from '../components/ConnectModal';
import { getLocationStatus, connectToLocation } from '../features/location/location.api';
import type { LocationRange, LocationDuration } from '../features/location/location.types';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface HomeScreenProps {
  navigation: HomeScreenNavigationProp;
}

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3000';
const DEFAULT_AVATAR = '/defaults/default-avatar.png';

const CACHE_KEYS = {
  profile: 'profile_cache',
  location: 'last_location_cache',
  permission: 'location_permission_status',
};

const DEFAULT_REGION: Region = {
  latitude: 37.38,
  longitude: -5.99,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const DEFAULT_DELTA = 0.01;

const FLOAT_BUTTON_SIZE = 56;

const getImageUrl = (imageUrl: string | null): string => {
  if (!imageUrl || imageUrl.trim() === '') {
    return `${SERVER_URL}${DEFAULT_AVATAR}`;
  }
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${SERVER_URL}${imageUrl}`;
};

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const locationWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const isScreenActiveRef = useRef(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const startWatchingLocation = useCallback(async () => {
    try {
      if (locationWatcherRef.current) {
        locationWatcherRef.current.remove();
        locationWatcherRef.current = null;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setLocation(coords);
      setLocationError(null);
      await SecureStore.setItemAsync(CACHE_KEYS.location, JSON.stringify(coords));
      mapRef.current?.animateToRegion(
        { ...coords, latitudeDelta: DEFAULT_DELTA, longitudeDelta: DEFAULT_DELTA },
        800,
      );

      const watcher = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 20,
          timeInterval: 7000,
        },
        (newPos) => {
          if (!isScreenActiveRef.current) return;
          const newCoords = {
            latitude: newPos.coords.latitude,
            longitude: newPos.coords.longitude,
          };
          setLocation(newCoords);
          SecureStore.setItemAsync(CACHE_KEYS.location, JSON.stringify(newCoords)).catch(() => {});
          mapRef.current?.animateToRegion(
            { ...newCoords, latitudeDelta: DEFAULT_DELTA, longitudeDelta: DEFAULT_DELTA },
            800,
          );
        }
      );
      locationWatcherRef.current = watcher;
    } catch {
      setLocationError('Ubication is required to use the app');
    }
  }, []);

  const handleRequestLocation = useCallback(async () => {
    try {
      const existing = await Location.getForegroundPermissionsAsync();
      if (existing.granted) {
        await startWatchingLocation();
        return;
      }

      if (existing.canAskAgain) {
        const request = await Location.requestForegroundPermissionsAsync();
        await SecureStore.setItemAsync(CACHE_KEYS.permission, request.status);
        if (request.granted) {
          await startWatchingLocation();
        } else {
          setLocation(null);
          setLocationError('Ubication is required to use the app');
        }
        return;
      }

      await Linking.openSettings();
    } catch {
      setLocationError('Ubication is required to use the app');
    }
  }, [startWatchingLocation]);

  useFocusEffect(
    useCallback(() => {
      isScreenActiveRef.current = true;

      const checkActiveSession = async () => {
        try {
          const status = await getLocationStatus();
          if (status.active && isScreenActiveRef.current) {
            navigation.replace('ConnectedMap', {
              range: status.range ?? 1000,
              durationMinutes: 60, // placeholder; screen reads from status anyway
            });
            return true;
          }
        } catch {
          // Backend not ready or no active session; stay on HomeScreen
        }
        return false;
      };

      const loadCachedData = async () => {
        try {
          const cachedProfile = await SecureStore.getItemAsync(CACHE_KEYS.profile);
          if (cachedProfile) {
            setProfile(JSON.parse(cachedProfile));
          }
        } catch { /* ignore cache read errors */ }

        try {
          const cachedLocation = await SecureStore.getItemAsync(CACHE_KEYS.location);
          if (cachedLocation) {
            setLocation(JSON.parse(cachedLocation));
          }
        } catch { /* ignore cache read errors */ }
      };

      const refreshInBackground = async () => {
        if (!isScreenActiveRef.current) return;
        setIsRefreshing(true);
        try {
          try {
            const profileData = await getMyProfile();
            if (!isScreenActiveRef.current) return;
            setProfile(profileData);
            await SecureStore.setItemAsync(CACHE_KEYS.profile, JSON.stringify(profileData));
          } catch { /* ignore network errors, keep cached profile */ }

          try {
            const cachedPermission = await SecureStore.getItemAsync(CACHE_KEYS.permission);
            let granted = cachedPermission === 'granted';

            if (!granted) {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (!isScreenActiveRef.current) return;
              granted = status === 'granted';
              await SecureStore.setItemAsync(CACHE_KEYS.permission, status);
            }

            if (granted) {
              await startWatchingLocation();
            } else {
              setLocation(null);
              setLocationError('Ubication is required to use the app');
            }
          } catch {
            if (isScreenActiveRef.current) {
              setLocation(null);
              setLocationError('Ubication is required to use the app');
            }
          }
        } finally {
          if (isScreenActiveRef.current) {
            setIsRefreshing(false);
          }
        }
      };

      const initialize = async () => {
        const hasActiveSession = await checkActiveSession();
        if (hasActiveSession) return;
        await loadCachedData();
        refreshInBackground();
      };

      initialize();

      return () => {
        isScreenActiveRef.current = false;
        if (locationWatcherRef.current) {
          locationWatcherRef.current.remove();
          locationWatcherRef.current = null;
        }
      };
    }, [startWatchingLocation])
  );

  const currentUser = location && profile
    ? { profile, coordinate: location }
    : undefined;

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
      />

      {locationError && (
        <View style={styles.errorRow}>
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={16} color={theme.colors.text} />
            <Text style={styles.errorBoxText}>{locationError}</Text>
          </View>
          <TouchableOpacity
            style={styles.enableBox}
            onPress={handleRequestLocation}
            activeOpacity={0.75}
          >
            <Text style={styles.enableBoxText}>Enable location</Text>
          </TouchableOpacity>
        </View>
      )}

      {isRefreshing && (
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

      {!locationError && (
        <TouchableOpacity
          style={[styles.connectButton, { bottom: insets.bottom > 0 ? insets.bottom + 10 : 40 }]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.75}
        >
          <Text style={styles.connectButtonText}>Connect</Text>
        </TouchableOpacity>
      )}

      <ConnectModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onConfirm={async (range: LocationRange, durationMinutes: LocationDuration) => {
          setModalVisible(false);
          try {
            await connectToLocation({ range, durationMinutes });
            navigation.navigate('ConnectedMap', { range, durationMinutes });
          } catch {
            Alert.alert('Connection failed', 'Could not connect to the map. Please try again.');
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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

  errorRow: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220, 50, 50, 0.92)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  errorBoxText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  enableBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.success,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  enableBoxText: {
    color: '#000000ff',
    fontSize: 13,
    fontWeight: '600',
  },
  connectButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 28,
    ...theme.shadows.md,
  },
  connectButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
});
