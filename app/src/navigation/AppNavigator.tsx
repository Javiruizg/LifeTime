import { useState, useEffect, useRef } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import AuthLoadingScreen from '../screens/AuthLoadingScreen';
import HomeScreen from '../screens/HomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ConnectedMapScreen from '../screens/ConnectedMapScreen';
import ChatScreen from '../screens/ChatScreen';
import SocialScreen from '../screens/SocialScreen';
import { getAccessToken } from '../features/auth/auth.service';
import { theme } from '../shared/lib/theme';

export type RootStackParamList = {
  AuthLoading: undefined;
  Home: undefined;
  Profile: undefined;
  ConnectedMap: { range?: number; durationMinutes?: number };
  Chat: {
    chatId: number;
    otherUserId: number;
    otherUserName: string;
    otherUserImageUrl?: string | null;
    isGroup?: boolean;
  };
  Social: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function AppNavigator() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const notificationListenerRef = useRef<Notifications.Subscription | null>(null);
  const responseListenerRef = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    checkExistingSession();
  }, []);

  useEffect(() => {
    // Request notification permissions (best-effort; may fail in test envs)
    Notifications.requestPermissionsAsync().catch(() => {});

    try {
      // Foreground notification listener
      notificationListenerRef.current = Notifications.addNotificationReceivedListener(() => {
        // Optional: suppress or customize foreground notification display
      });
    } catch { /* ignore in test envs */ }

    try {
      // Notification response listener: handle taps on scheduled notifications
      responseListenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
        const title = response.notification.request.content.title;
        const data = response.notification.request.content.data as Record<string, unknown> | undefined;

        if (title === 'Disconnected from map') {
          if (navigationRef.isReady()) {
            navigationRef.navigate('Home');
          }
        }

      });
    } catch { /* ignore in test envs */ }

    // Check if app was opened from a notification
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const title = response?.notification.request.content.title;
        const data = response?.notification.request.content.data as Record<string, unknown> | undefined;

        if (title === 'Disconnected from map') {
          if (navigationRef.isReady()) {
            navigationRef.navigate('Home');
          }
        }

        // Chat notification tap handling removed
      })
      .catch(() => { /* ignore in test envs */ });

    return () => {
      if (notificationListenerRef.current) {
        try {
          notificationListenerRef.current.remove();
        } catch { /* ignore */ }
      }
      if (responseListenerRef.current) {
        try {
          responseListenerRef.current.remove();
        } catch { /* ignore */ }
      }
    };
  }, []);

  const checkExistingSession = async () => {
    try {
      const token = await getAccessToken();
      setIsAuthenticated(!!token);
    } catch {
      setIsAuthenticated(false);
    }
  };

  const handleAuthComplete = () => {
    setIsAuthenticated(true);
  };

  const handleAuthError = () => {
    setIsAuthenticated(false);
  };

  if (isAuthenticated === null) {
    return null;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          [
            <Stack.Screen key="Home" name="Home" component={HomeScreen} />,
            <Stack.Screen key="ConnectedMap" name="ConnectedMap" component={ConnectedMapScreen} />,
            <Stack.Screen key="Chat" name="Chat" component={ChatScreen} />,
            <Stack.Screen key="Social" name="Social" component={SocialScreen} />,
            <Stack.Screen
              key="Profile"
              name="Profile"
              component={ProfileScreen}
              options={{
                headerShown: true,
                title: 'Profile',
                headerStyle: { backgroundColor: theme.colors.surface },
                headerTintColor: theme.colors.primary,
                headerTitleStyle: {
                  fontWeight: theme.typography.fontWeight.bold,
                  fontSize: theme.typography.fontSize.lg,
                  color: theme.colors.text,
                },
                headerShadowVisible: false,
              }}
            />,
          ]
        ) : (
          <Stack.Screen name="AuthLoading">
            {(props) => (
              <AuthLoadingScreen
                {...props}
                onAuthComplete={handleAuthComplete}
                onError={handleAuthError}
              />
            )}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
