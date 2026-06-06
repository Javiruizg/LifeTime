import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('@expo/vector-icons', () => ({
  Feather: 'Feather',
}));

jest.mock('../../src/features/chat/chat.service', () => ({
  getMessages: jest.fn().mockResolvedValue({
    messages: [],
    nextCursor: null,
    hasMore: false,
  }),
}));

jest.mock('../../src/features/chat/chat.socket.service', () => ({
  joinChat: jest.fn(),
  leaveChat: jest.fn(),
  sendMessageSocket: jest.fn(),
  onChatMessage: jest.fn(() => jest.fn()),
  onChatSeen: jest.fn(() => jest.fn()),
  markSeenSocket: jest.fn(),
}));

jest.mock('../../src/features/auth/auth.service', () => ({
  getUserId: jest.fn().mockResolvedValue(1),
}));

import ChatScreen from '../../src/screens/ChatScreen';

describe('ChatScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;
    const route = {
      params: {
        chatId: 5,
        otherUserId: 2,
        otherUserName: 'Bob',
        otherUserImageUrl: null,
      },
    };

    let component: any;
    await act(async () => {
      component = renderer.create(<ChatScreen navigation={navigation} route={route} />);
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(component).toBeDefined();
  });

  it('renders other user name', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;
    const route = {
      params: {
        chatId: 5,
        otherUserId: 2,
        otherUserName: 'Bob',
        otherUserImageUrl: null,
      },
    };

    let component: any;
    await act(async () => {
      component = renderer.create(<ChatScreen navigation={navigation} route={route} />);
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const texts = component.root.findAllByType('Text');
    const contents = texts.map((t: any) => t.props.children);
    expect(contents).toContain('Bob');
  });

  it('renders TextInput for message input', async () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;
    const route = {
      params: {
        chatId: 5,
        otherUserId: 2,
        otherUserName: 'Bob',
        otherUserImageUrl: null,
      },
    };

    let component: any;
    await act(async () => {
      component = renderer.create(<ChatScreen navigation={navigation} route={route} />);
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const textInputs = component.root.findAllByType('TextInput');
    expect(textInputs.length).toBeGreaterThan(0);
  });
});
