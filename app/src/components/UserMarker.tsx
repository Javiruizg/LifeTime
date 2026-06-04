import { useState } from 'react';
import { StyleSheet, View, Image, Text } from 'react-native';
import { Marker } from 'react-native-maps';
import { theme } from '../shared/lib/theme';

interface UserMarkerProps {
  coordinate: {
    latitude: number;
    longitude: number;
  };
  profile: {
    message?: string | null;
    imageUrl: string | null;
  };
  isSelf?: boolean;
}

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3000';
const DEFAULT_AVATAR = '/defaults/default-avatar.png';

const AVATAR_SIZE = 44;
const BORDER_WIDTH = 3;
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

export default function UserMarker({ coordinate, profile, isSelf = false }: UserMarkerProps) {
  const [hasError, setHasError] = useState(false);

  const imageUri = hasError ? `${SERVER_URL}${DEFAULT_AVATAR}` : getImageUrl(profile.imageUrl);
  const showBubble = !!profile.message && profile.message.trim() !== '';
  const accentColor = isSelf ? '#22d3ee' : theme.colors.primary;

  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 1 }}>
      <View style={styles.markerContent}>
        <View style={styles.bubbleArea}>
          <View style={[styles.speechBubble, !showBubble && styles.hidden]}>
            <Text style={styles.speechText} numberOfLines={3}>
              {profile.message?.trim() || ''}
            </Text>
          </View>
          <View style={[styles.speechTailDown, !showBubble && styles.hidden]} />
        </View>
        <View style={[styles.avatarOuter, { backgroundColor: accentColor }]}>
          <Image
            source={{ uri: imageUri }}
            style={styles.avatarImg}
            resizeMode="cover"
            onError={() => setHasError(true)}
          />
        </View>
        <View style={[styles.pinStem, { backgroundColor: accentColor }]} />
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
  bubbleArea: {
    width: MARKER_W,
    height: 68,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 4,
    position: 'relative',
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
  speechBubble: {
    position: 'absolute',
    bottom: 6,
    left: '32%',
    marginLeft: BUBBLE_SHIFT,
    maxWidth: 180,
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
});
