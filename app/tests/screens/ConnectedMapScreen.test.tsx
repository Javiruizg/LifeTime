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

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-notifications', () => ({
  cancelAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('../../src/features/location/location.api', () => ({
  getLocationStatus: jest.fn().mockResolvedValue({ active: false }),
  disconnectFromLocation: jest.fn(),
}));

jest.mock('../../src/features/location/location.socket.service', () => ({
  startSharing: jest.fn(),
  stopSharing: jest.fn(),
}));

jest.mock('../../src/shared/lib/socket', () => ({
  getSocket: jest.fn(() => null),
}));

jest.mock('../../src/features/profile/profile.service', () => ({
  getMyProfile: jest.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: 'Test User',
    message: 'Hello',
    imageUrl: null,
  }),
}));

jest.mock('../../src/features/chat/chat.service', () => ({
  getOrCreatePrivateChat: jest.fn(),
}));

jest.mock('../../src/components/LiveMap', () => 'LiveMap');

jest.mock('@expo/vector-icons', () => ({
  Feather: 'Feather',
}));

import ConnectedMapScreen from '../../src/screens/ConnectedMapScreen';

describe('ConnectedMapScreen', () => {
  let mountedRenderers: any[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    mountedRenderers = [];
  });

  afterEach(() => {
    for (const r of mountedRenderers) {
      act(() => { r.unmount(); });
    }
  });

  async function renderAndTrack(props = {}): Promise<any> {
    const navigation = { navigate: jest.fn(), replace: jest.fn() } as any;
    let r: any;
    await act(async () => {
      r = renderer.create(<ConnectedMapScreen navigation={navigation} {...props} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    mountedRenderers.push(r);
    return r;
  }

  it('renders without crashing', async () => {
    const component = await renderAndTrack();
    expect(component).toBeDefined();
  });

  it('renders LiveMap component', async () => {
    const component = await renderAndTrack();
    const liveMaps = component.root.findAllByType('LiveMap');
    expect(liveMaps.length).toBe(1);
  });

  it('renders Disconnect button', async () => {
    const component = await renderAndTrack();
    const texts = component.root.findAllByType('Text');
    const contents = texts.map((t: any) => t.props.children);
    expect(contents).toContain('Disconnect');
  });
});
