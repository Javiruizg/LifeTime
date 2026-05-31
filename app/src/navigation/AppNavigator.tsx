import { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AuthLoadingScreen from '../screens/AuthLoadingScreen';
import HomeScreen from '../screens/HomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { getAccessToken } from '../features/auth/auth.service';
import { theme } from '../shared/lib/theme';

export type RootStackParamList = {
  AuthLoading: undefined;
  Home: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    checkExistingSession();
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
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          [
            <Stack.Screen key="Home" name="Home" component={HomeScreen} />,
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
