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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../shared/lib/api';
import { getMyProfile, updateProfile } from '../features/profile/profile.service';
import type { Profile } from '../features/profile/profile.types';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL;

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await getMyProfile();
      setProfile(data);
      setName(data.name);
      setMessage(data.message);
    } catch {
      Alert.alert('Error', 'Could not load profile');
    } finally {
      setLoading(false);
    }
  };

  const getImageUrl = (imageUrl: string | null): string => {
    if (!imageUrl) return '';
    if (imageUrl.startsWith('http')) return imageUrl;
    return `${SERVER_URL}${imageUrl}`;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateProfile({ name, message });
      setProfile(updated);
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
      setProfile((prev) => (prev ? { ...prev, imageUrl: response.data.imageUrl } : null));
    } catch {
      Alert.alert('Error', 'Could not upload image');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handlePickImage} style={styles.avatarContainer}>
            <Image
              source={{ uri: getImageUrl(profile.imageUrl) }}
              style={styles.avatar}
            />
            <View style={styles.avatarOverlay}>
              <Text style={styles.avatarOverlayText}>Change</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                maxLength={100}
              />
            ) : (
              <Text style={styles.value}>{profile.name || 'No name set'}</Text>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Status message</Text>
            {editing ? (
              <TextInput
                style={[styles.input, styles.messageInput]}
                value={message}
                onChangeText={setMessage}
                placeholder="What's on your mind?"
                maxLength={255}
                multiline
              />
            ) : (
              <Text style={styles.value}>{profile.message || 'No message set'}</Text>
            )}
          </View>

          {editing ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => {
                  setName(profile.name);
                  setMessage(profile.message);
                  setEditing(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setEditing(true)}
            >
              <Text style={styles.editButtonText}>Edit Profile</Text>
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
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e0e0e0',
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderBottomLeftRadius: 60,
    borderBottomRightRadius: 60,
    paddingVertical: 6,
    alignItems: 'center',
  },
  avatarOverlayText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  form: {
    paddingHorizontal: 24,
  },
  field: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  messageInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  value: {
    fontSize: 16,
    color: '#333',
    paddingVertical: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  editButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
});
