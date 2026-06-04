import { useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar,
  Text,
  Linking,
} from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { getMyProfile } from '../features/profile/profile.service';
import type { Profile } from '../features/profile/profile.types';
import { theme } from '../shared/lib/theme';
import LiveMap from '../components/LiveMap';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface HomeScreenProps {
  navigation: HomeScreenNavigationProp;
}

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3000';
const DEFAULT_AVATAR = '/defaults/default-avatar.png';

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
  const mapRef = useRef<MapView>(null);
  const locationWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const isScreenActiveRef = useRef(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

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

      const initialize = async () => {
        setLoading(true);

        try {
          const profileData = await getMyProfile();
          if (!isScreenActiveRef.current) return;
          setProfile(profileData);

          const { status } = await Location.requestForegroundPermissionsAsync();
          if (!isScreenActiveRef.current) return;

          if (status !== 'granted') {
            setLocation(null);
            setLocationError('Ubication is required to use the app');
            if (isScreenActiveRef.current) setLoading(false);
            return;
          }

          await startWatchingLocation();
        } catch {
          if (isScreenActiveRef.current) {
            setProfile(null);
            setLocation(null);
            setLocationError(null);
          }
        } finally {
          if (isScreenActiveRef.current) {
            setLoading(false);
          }
        }
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

  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

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

      <TouchableOpacity
        style={styles.floatButtonLeft}
        onPress={() => navigation.navigate('Profile')}
        activeOpacity={0.75}
      >
        {profile ? (
          <Image source={{ uri: getImageUrl(profile.imageUrl) }} style={styles.floatButtonImg} />
        ) : (
          <View style={styles.floatButtonFallback}>
            <Feather name="user" size={22} color={theme.colors.text} />
          </View>
        )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
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
});
