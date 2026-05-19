import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { loginOrRegister } from '../features/auth/auth.service';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

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
      console.log('Device ID was already stored');

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
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 32,
  },
  status: {
    fontSize: 16,
    color: '#666',
    marginTop: 24,
    textAlign: 'center',
  },
});
