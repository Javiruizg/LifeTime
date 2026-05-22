import { Platform } from 'react-native';

export const theme = {
  colors: {
    // Backgrounds
    background: '#0F172A', // Slate 900
    surface: '#1E293B',    // Slate 800
    surfaceAlt: '#334155', // Slate 700

    // Primary Accents
    primary: '#38BDF8', // Sky 400
    primaryMuted: 'rgba(56, 189, 248, 0.15)',
    accent: '#818CF8', // Indigo 400
    
    // Status
    danger: '#F87171', // Red 400
    dangerMuted: 'rgba(248, 113, 113, 0.15)',
    success: '#34D399', // Emerald 400
    
    // Borders
    border: '#334155', // Slate 700
    borderLight: '#475569', // Slate 600
    
    // Text
    text: '#F8FAFC', // Slate 50
    textSecondary: '#CBD5E1', // Slate 300
    textMuted: '#94A3B8', // Slate 400
    
    // Base Utils
    white: '#FFFFFF',
    black: '#000000',
    transparent: 'transparent',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    '2xl': 48,
    '3xl': 64,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    round: 9999,
  },
  typography: {
    fontSize: {
      xs: 12,
      sm: 14,
      base: 16,
      lg: 18,
      xl: 20,
      '2xl': 24,
      '3xl': 30,
      '4xl': 36,
    },
    fontWeight: {
      normal: '400' as const,
      medium: '500' as const,
      semibold: '600' as const,
      bold: '700' as const,
    },
  },
  shadows: {
    sm: Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
    md: Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
    lg: Platform.select({
      ios: {
        shadowColor: '#00F', // Slight blue tint to shadow for dark mode depth
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: {
        elevation: 10,
      },
      default: {},
    }),
    neon: Platform.select({
      ios: {
        shadowColor: '#38BDF8',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
      },
      android: {
        elevation: 15,
      },
      default: {},
    }),
  },
};
