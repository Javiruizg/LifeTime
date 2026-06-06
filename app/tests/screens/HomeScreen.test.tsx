import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: () => {},
}));

jest.mock('expo-location', () => ({
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: 37.38, longitude: -5.99 },
  }),
  watchPositionAsync: jest.fn().mockResolvedValue({ remove: jest.fn() }),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
  Accuracy: { Balanced: 3 },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/features/profile/profile.service', () => ({
  getMyProfile: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/features/location/location.api', () => ({
  getLocationStatus: jest.fn().mockResolvedValue({ active: false }),
  connectToLocation: jest.fn(),
}));

jest.mock('../../src/components/LiveMap', () => 'LiveMap');
jest.mock('../../src/components/ConnectModal', () => 'ConnectModal');

jest.mock('@expo/vector-icons', () => ({
  Feather: 'Feather',
}));

import HomeScreen from '../../src/screens/HomeScreen';

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const navigation = { navigate: jest.fn(), replace: jest.fn() } as any;
    let component: any;
    act(() => {
      component = renderer.create(<HomeScreen navigation={navigation} />);
    });
    expect(component).toBeDefined();
  });

  it('renders Connect button text', () => {
    const navigation = { navigate: jest.fn(), replace: jest.fn() } as any;
    let component: any;
    act(() => {
      component = renderer.create(<HomeScreen navigation={navigation} />);
    });
    const texts = component.root.findAllByType('Text');
    const contents = texts.map((t: any) => t.props.children);
    expect(contents).toContain('Connect');
  });

  it('renders LiveMap component', () => {
    const navigation = { navigate: jest.fn(), replace: jest.fn() } as any;
    let component: any;
    act(() => {
      component = renderer.create(<HomeScreen navigation={navigation} />);
    });
    const liveMaps = component.root.findAllByType('LiveMap');
    expect(liveMaps.length).toBe(1);
  });

  it('has View container', () => {
    const navigation = { navigate: jest.fn(), replace: jest.fn() } as any;
    let component: any;
    act(() => {
      component = renderer.create(<HomeScreen navigation={navigation} />);
    });
    const views = component.root.findAllByType('View');
    expect(views.length).toBeGreaterThan(0);
  });
});
