import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { loginOrRegister } from '../features/auth/auth.service';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { theme } from '../shared/lib/theme';

interface AuthLoadingScreenProps {
  onAuthComplete: () => void;
  onError: (message: string) => void;
}

export default function AuthLoadingScreen({ onAuthComplete, onError }: AuthLoadingScreenProps) {
  const [status, setStatus] = useState('Starting...');

  useEffect(() => {
    authenticate();
  }, []);

  const authenticate = async () => {
    try {
      setStatus('Getting device identifier...');

      let deviceId = await SecureStore.getItemAsync('user_device_id');

      if (!deviceId) {
        setStatus('Generating secure identifier...');
        console.log('No device ID found, generating a new one');
        deviceId = Crypto.randomUUID();
        await SecureStore.setItemAsync('user_device_id', deviceId);
      }

      if (!deviceId) {
        throw new Error('Could not generate or retrieve a secure identifier for this device.');
      }

      setStatus('Authenticating...');
      const result = await loginOrRegister(deviceId);

      if (result.success) {
        onAuthComplete();
      } else {
        onError('Authentication could not be completed');
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Authentication error');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LifeTime</Text>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: theme.typography.fontSize['4xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
    marginBottom: 32,
    letterSpacing: 2,
  },
  status: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textMuted,
    marginTop: 24,
    textAlign: 'center',
  },
});
