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
import MapView, { Marker, type Region, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { getMyProfile } from '../features/profile/profile.service';
import type { Profile } from '../features/profile/profile.types';
import { theme } from '../shared/lib/theme';

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

const ANTARCTICA_REGION: Region = {
  latitude: -75.0,
  longitude: 0.0,
  latitudeDelta: 30,
  longitudeDelta: 60,
};

const DEFAULT_DELTA = 0.01;

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1E293B' }] },
  { elementType: 'geometry.stroke', stylers: [{ color: '#334155' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#CBD5E1' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1E293B' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#94A3B8' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#94A3B8' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0F172A' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#1E293B' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1E293B' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#94A3B8' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#162218' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#94A3B8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#475569' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#CBD5E1' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#475569' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c2d48' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#94A3B8' }] },
];

const AVATAR_SIZE = 44;
const BORDER_WIDTH = 3;
const FLOAT_BUTTON_SIZE = 56;

const AVATAR_OUTER = AVATAR_SIZE + BORDER_WIDTH * 2;
const BUBBLE_MAX_W = 220;
const BUBBLE_SHIFT = 20;
const MARKER_W = BUBBLE_MAX_W + BUBBLE_SHIFT + AVATAR_OUTER;

const getImageUrl = (imageUrl: string | null): string => {
  if (!imageUrl || imageUrl.trim() === '') {
    return `${SERVER_URL}${DEFAULT_AVATAR}`;
  }
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${SERVER_URL}${imageUrl}`;
};

const getSafeLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    };
  } catch {
    return null;
  }
};

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const mapRef = useRef<MapView>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const handleRequestLocation = useCallback(async () => {
    try {
      const existing = await Location.getForegroundPermissionsAsync();
      if (existing.granted) {
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
        return;
      }

      if (existing.canAskAgain) {
        const request = await Location.requestForegroundPermissionsAsync();
        if (request.granted) {
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
        } else {
          setLocationError('Ubication is required to use the app');
        }
        return;
      }

      await Linking.openSettings();
    } catch {
      setLocationError('Ubication is required to use the app');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const loadScreenData = async () => {
        setLoading(true);

        try {
          const [profileData, coords] = await Promise.all([getMyProfile(), getSafeLocation()]);

          if (cancelled) return;

          setProfile(profileData);

          if (coords) {
            setLocation(coords);
            setLocationError(null);

            mapRef.current?.animateToRegion(
              {
                latitude: coords.latitude,
                longitude: coords.longitude,
                latitudeDelta: DEFAULT_DELTA,
                longitudeDelta: DEFAULT_DELTA,
              },
              800,
            );
          } else {
            setLocation(null);
            setLocationError('Ubication is required to use the app');
            mapRef.current?.animateToRegion(DEFAULT_REGION, 800);
          }
        } catch {
          if (!cancelled) {
            setProfile(null);
            setLocation(null);
            setLocationError(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      };

      loadScreenData();

      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const showMarker = location && profile;

  const hiddenLocation = {
    latitude: ANTARCTICA_REGION.latitude,
    longitude: ANTARCTICA_REGION.longitude,
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        customMapStyle={Platform.OS === 'android' ? DARK_MAP_STYLE : undefined}
        initialRegion={
          location
            ? { ...location, latitudeDelta: DEFAULT_DELTA, longitudeDelta: DEFAULT_DELTA }
            : DEFAULT_REGION
        }
        showsCompass={false}
        showsScale={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        userInterfaceStyle="dark"
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {showMarker && (
          <Marker
            coordinate={location}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.markerContent}>
              <View style={styles.bubbleArea}>
                <View style={[
                  styles.speechBubble,
                  (!profile.message || profile.message.trim() === '') && styles.hidden,
                ]}>
                  <Text style={styles.speechText} numberOfLines={3}>
                    {profile.message?.trim() || ''}
                  </Text>
                </View>
                <View style={[
                  styles.speechTailDown,
                  (!profile.message || profile.message.trim() === '') && styles.hidden,
                ]} />
              </View>
              <View style={styles.avatarOuter}>
                <Image
                  source={{ uri: getImageUrl(profile.imageUrl) }}
                  style={styles.avatarImg}
                  resizeMode="cover"
                  onError={() => setProfile({ ...profile, imageUrl: null })}
                />
              </View>
              <View style={styles.pinStem} />
              <View style={styles.pinDot} />
            </View>
          </Marker>
        )}

        {!showMarker && profile && (
          <Marker coordinate={hiddenLocation}>
            <View style={styles.avatarOuter}>
              <Image
                source={{ uri: getImageUrl(profile.imageUrl) }}
                style={styles.avatarImg}
                resizeMode="cover"
              />
            </View>
          </Marker>
        )}
      </MapView>

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

  markerContent: {
    alignItems: 'center',
    width: MARKER_W,
  },
  bubbleArea: {
    width: MARKER_W,
    height: 68,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 4,
    position: 'relative',
  },
  avatarOuter: {
    width: AVATAR_SIZE + BORDER_WIDTH * 2,
    height: AVATAR_SIZE + BORDER_WIDTH * 2,
    borderRadius: (AVATAR_SIZE + BORDER_WIDTH * 2) / 2,
    backgroundColor: theme.colors.primary,
    padding: BORDER_WIDTH,
    //overflow: 'hidden', 
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: theme.colors.surfaceAlt,
    overflow: 'hidden',
  },
  pinStem: {
    width: 3,
    height: 12,
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
    marginTop: -1,
  },
  pinDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginTop: -2,
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

  speechBubble: {
    position: 'absolute',
    bottom: 6,
    left: '32%',
    marginLeft: BUBBLE_SHIFT,
    maxWidth: 200,
    backgroundColor: 'rgba(255, 255, 255, 1)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(66, 67, 69, 0.25)',
  },
  hidden: {
    opacity: 0,
  },
  speechText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  speechTailDown: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    marginLeft: -5,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(255, 255, 255, 1)',
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