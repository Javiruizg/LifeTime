import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import MapView, { type Region, PROVIDER_DEFAULT } from 'react-native-maps';
import UserMarker from './UserMarker';
import type { Profile } from '../features/profile/profile.types';

interface LiveMapProps {
  initialRegion?: Region;
  currentUser?: {
    profile: Profile;
    coordinate: { latitude: number; longitude: number };
  };
  otherUsers?: Array<{
    userId: number;
    profile: Profile;
    coordinate: { latitude: number; longitude: number };
  }>;
  onRegionChange?: (region: Region) => void;
}

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

const LiveMap = forwardRef<MapView, LiveMapProps>(
  ({ initialRegion, currentUser, otherUsers, onRegionChange }, ref) => {
    const mapRef = useRef<MapView>(null);

    useImperativeHandle(ref, () => mapRef.current!);

    return (
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        customMapStyle={Platform.OS === 'android' ? DARK_MAP_STYLE : undefined}
        initialRegion={initialRegion}
        showsCompass={false}
        showsScale={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        userInterfaceStyle="dark"
        pitchEnabled={false}
        toolbarEnabled={false}
        onRegionChangeComplete={onRegionChange}
      >
        {currentUser && (
          <UserMarker
            coordinate={currentUser.coordinate}
            profile={{
              message: currentUser.profile.message,
              imageUrl: currentUser.profile.imageUrl,
            }}
          />
        )}

        {otherUsers?.map((user) => (
          <UserMarker
            key={user.userId}
            coordinate={user.coordinate}
            profile={{
              message: user.profile.message,
              imageUrl: user.profile.imageUrl,
            }}
          />
        ))}
      </MapView>
    );
  }
);

LiveMap.displayName = 'LiveMap';

export default LiveMap;
