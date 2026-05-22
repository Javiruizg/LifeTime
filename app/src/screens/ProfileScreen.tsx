import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { api } from '../shared/lib/api';
import { getMyProfile, updateProfile } from '../features/profile/profile.service';
import type { Profile } from '../features/profile/profile.types';
import { theme } from '../shared/lib/theme';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL;
const DEFAULT_AVATAR = '/defaults/default-avatar.png';

const MAX_NAME_LENGTH = 20;
const MAX_MESSAGE_LENGTH = 50;

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [bubbleText, setBubbleText] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await getMyProfile();
      setProfile(data);
      setName(data.name);
      setMessage(data.message);
      setBubbleText(data.message);
    } catch {
      Alert.alert('Error', 'Could not load profile');
    } finally {
      setLoading(false);
    }
  };

  const getImageUrl = (imageUrl: string | null): string => {
    if (!imageUrl || imageUrl.trim() === '') {
      return `${SERVER_URL}${DEFAULT_AVATAR}`;
    }
    if (imageUrl.startsWith('http')) return imageUrl;
    return `${SERVER_URL}${imageUrl}`;
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    setSaving(true);
    try {
      const updated = await updateProfile({ name, message: bubbleText });
      setProfile(updated);
      setMessage(bubbleText);
      setEditing(false);
    } catch {
      Alert.alert('Error', 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please grant access to your photos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const formData = new FormData();
    formData.append('image', {
      uri: asset.uri,
      name: asset.uri.split('/').pop() || 'photo.jpg',
      type: asset.mimeType || 'image/jpeg',
    } as any);

    try {
      const response = await api.post<{ imageUrl: string }>('/upload/profile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProfile((prev) => (prev ? { ...prev, imageUrl: response.data.imageUrl } : prev));
    } catch {
      Alert.alert('Error', 'Could not upload image');
    }
  };

  const handleDeleteImage = async () => {
    Alert.alert('Delete photo', 'Are you sure you want to remove your profile photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete('/upload/profile');
            setProfile((prev) =>
              prev ? { ...prev, imageUrl: DEFAULT_AVATAR } : prev
            );
          } catch {
            Alert.alert('Error', 'Could not delete photo');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Profile not found</Text>
      </View>
    );
  }

  const hasName = (profile.name || '').trim().length > 0;
  const hasMessage = (profile.message || '').trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.profileGroup}>
          <View style={styles.avatarWrapper}>
            <Image
              source={{ uri: getImageUrl(profile.imageUrl) }}
              style={styles.avatar}
            />
            <View style={styles.avatarButtonsRow}>
              <TouchableOpacity style={styles.avatarButtonDelete} onPress={handleDeleteImage}>
                <Feather name="trash-2" size={18} color={theme.colors.background}/>
              </TouchableOpacity>
              <TouchableOpacity style={styles.avatarButtonEdit} onPress={handlePickImage}>
                <Feather name="edit-2" size={18} color={theme.colors.background} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.speechBubbleContainer}>
            <View style={styles.speechBubbleTail} />
            <View style={styles.speechBubble}>
              {editing ? (
                <TextInput
                  style={styles.speechBubbleInput}
                  value={bubbleText}
                  onChangeText={setBubbleText}
                  placeholder="Write your message..."
                  placeholderTextColor={theme.colors.textMuted}
                  maxLength={MAX_MESSAGE_LENGTH}
                  multiline
                  textAlignVertical="top"
                />
              ) : (
                <Text
                  style={[
                    styles.speechBubbleText,
                    !hasMessage && styles.placeholderText,
                  ]}
                >
                  {profile.message || 'No message set'}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.cardsContainer}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>NAME</Text>
            <View style={styles.cardContent}>
              <Text style={styles.userIcon}>👤</Text>
              {editing ? (
                <TextInput
                  style={styles.cardInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor={theme.colors.textMuted}
                  maxLength={MAX_NAME_LENGTH}
                />
              ) : (
                <Text
                  style={[
                    styles.cardValue,
                    !hasName && styles.placeholderText,
                  ]}
                >
                  {profile.name || 'No name set'}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.bottomSection}>
          {editing ? (
            <View style={styles.editActions}>
              <TouchableOpacity
                style={[styles.editButton, styles.cancelButton]}
                onPress={() => {
                  Keyboard.dismiss();
                  setName(profile.name);
                  setBubbleText(profile.message);
                  setEditing(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editButton, styles.saveButton]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={theme.colors.background} size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.editProfileButton}
              onPress={() => setEditing(true)}
            >
              <Text style={styles.editProfileButtonText}>Edit Profile</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  profileGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  avatarWrapper: {
    position: 'relative',
    flexShrink: 0,
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: theme.radius.round,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 4,
    borderColor: theme.colors.background,
    ...theme.shadows.md,
  },
  avatarButtonsRow: {
    position: 'absolute',
    bottom: -4,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  avatarButtonDelete: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.round,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.colors.background,
    ...theme.shadows.sm,
  },
  avatarButtonEdit: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.round,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.colors.background,
    ...theme.shadows.sm,
  },
  avatarIcon: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.background,
  },
  userIcon: {
    fontSize: theme.typography.fontSize.xl,
  },
  speechBubbleContainer: {
    flex: 1,
    maxWidth: '55%',
  },
  speechBubbleTail: {
    position: 'absolute',
    left: -10,
    top: 20,
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderRightWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: theme.colors.surface,
    zIndex: 1,
  },
  speechBubble: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 50,
    ...theme.shadows.sm,
  },
  speechBubbleInput: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    lineHeight: 22,
    minHeight: 36,
  },
  speechBubbleText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    lineHeight: 22,
  },
  placeholderText: {
    color: theme.colors.textMuted,
    fontStyle: 'italic',
  },
  cardsContainer: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  cardLabel: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardInput: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    paddingVertical: 4,
  },
  cardValue: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
  },
  bottomSection: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xl,
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: theme.radius.xl,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cancelButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    ...theme.shadows.neon,
  },
  saveButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.background,
  },
  editProfileButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: theme.radius.round,
    alignItems: 'center',
    ...theme.shadows.neon,
  },
  editProfileButtonText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.background,
  },
  errorText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
});
