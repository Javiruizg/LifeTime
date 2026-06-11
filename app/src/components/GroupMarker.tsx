import { useState } from 'react';
import { StyleSheet, View, Image } from 'react-native';
import { Marker } from 'react-native-maps';
import { theme } from '../shared/lib/theme';

interface GroupMarkerProps {
  coordinate: {
    latitude: number;
    longitude: number;
  };
  name: string;
  imageUrl: string | null;
  membersCount: number;
  hasUnread?: boolean;
  onPress?: () => void;
}

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3000';
const DEFAULT_GROUP_AVATAR = '/defaults/default-group.png';

const AVATAR_SIZE = 54;
const BORDER_WIDTH = 3;
const AVATAR_OUTER = AVATAR_SIZE + BORDER_WIDTH * 2;
const MARKER_W = AVATAR_OUTER + 40;

const getImageUrl = (imageUrl: string | null): string => {
  if (!imageUrl || imageUrl.trim() === '') {
    return `${SERVER_URL}${DEFAULT_GROUP_AVATAR}`;
  }
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${SERVER_URL}${imageUrl}`;
};

export default function GroupMarker({
  coordinate,
  imageUrl,
  hasUnread = false,
  onPress,
}: GroupMarkerProps) {
  const [hasError, setHasError] = useState(false);

  const imageUri = hasError ? `${SERVER_URL}${DEFAULT_GROUP_AVATAR}` : getImageUrl(imageUrl);
  const borderColor = hasUnread ? '#EF4444' : '#22c55e'; // Red if unread, green otherwise

  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 1 }} onPress={onPress}>
      <View style={styles.markerContent}>
        <View style={[styles.avatarOuter, { backgroundColor: borderColor }]}>
          <Image
            source={{ uri: imageUri }}
            style={styles.avatarImg}
            resizeMode="cover"
            onError={() => setHasError(true)}
          />
        </View>
        <View style={[styles.pinStem, { backgroundColor: borderColor }]} />
        <View style={styles.pinDot} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  markerContent: {
    alignItems: 'center',
    width: MARKER_W,
  },
  avatarOuter: {
    width: AVATAR_OUTER,
    height: AVATAR_OUTER,
    borderRadius: AVATAR_OUTER / 2,
    padding: BORDER_WIDTH,
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
});
