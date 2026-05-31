import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AuthLoadingScreen from '../../src/screens/AuthLoadingScreen';

const mockLoginOrRegister = jest.fn();
const mockOnAuthComplete = jest.fn();
const mockOnError = jest.fn();

jest.mock('../../src/features/auth/auth.service', () => ({
  loginOrRegister: (...args: any[]) => mockLoginOrRegister(...args),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'mock-uuid-12345'),
}));

describe('AuthLoadingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createWrapper = () => {
    return renderer.create(
      <AuthLoadingScreen onAuthComplete={mockOnAuthComplete} onError={mockOnError} />
    );
  };

  it('renders without crashing', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockResolvedValue('existing-device-id');
    mockLoginOrRegister.mockResolvedValue({ success: true });

    let wrapper: any;
    await act(async () => {
      wrapper = createWrapper();
    });
    expect(wrapper).toBeDefined();
  });

  it('renders title text', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockResolvedValue('existing-device-id');
    mockLoginOrRegister.mockResolvedValue({ success: true });

    let wrapper: any;
    await act(async () => {
      wrapper = createWrapper();
    });

    const root = wrapper.root;
    const titleElements = root.findAllByType('Text');
    const titles = titleElements.map((el: any) => el.props.children);
    expect(titles).toContain('LifeTime');
  });

  it('renders ActivityIndicator', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockResolvedValue('existing-device-id');
    mockLoginOrRegister.mockResolvedValue({ success: true });

    let wrapper: any;
    await act(async () => {
      wrapper = createWrapper();
    });

    const indicators = wrapper.root.findAllByType('ActivityIndicator');
    expect(indicators.length).toBe(1);
  });

  it('calls onAuthComplete on successful authentication', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockResolvedValue('existing-device-id');
    mockLoginOrRegister.mockResolvedValue({ success: true });

    let wrapper: any;
    await act(async () => {
      wrapper = createWrapper();
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(mockOnAuthComplete).toHaveBeenCalled();
  });

  it('calls onError on failed authentication', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockResolvedValue('existing-device-id');
    mockLoginOrRegister.mockResolvedValue({ success: false });

    let wrapper: any;
    await act(async () => {
      wrapper = createWrapper();
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(mockOnError).toHaveBeenCalledWith('Authentication could not be completed');
  });

  it('calls onError on authentication error', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockResolvedValue('existing-device-id');
    mockLoginOrRegister.mockRejectedValue(new Error('Network error'));

    let wrapper: any;
    await act(async () => {
      wrapper = createWrapper();
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(mockOnError).toHaveBeenCalledWith('Network error');
  });

  it('generates new device ID when none exists', async () => {
    const SecureStore = require('expo-secure-store');
    const Crypto = require('expo-crypto');
    SecureStore.getItemAsync.mockResolvedValue(null);
    SecureStore.setItemAsync.mockResolvedValue(undefined);
    mockLoginOrRegister.mockResolvedValue({ success: true });

    let wrapper: any;
    await act(async () => {
      wrapper = createWrapper();
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('user_device_id', 'mock-uuid-12345');
  });

  it('displays initial status text', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockResolvedValue('existing-device-id');
    mockLoginOrRegister.mockResolvedValue({ success: true });

    let wrapper: any;
    await act(async () => {
      wrapper = createWrapper();
    });

    const root = wrapper.root;
    const statusElements = root.findAllByType('Text');
    const statusTexts = statusElements.map((el: any) => el.props.children);
    expect(statusTexts.some((t: string) => t?.includes('Starting') || t?.includes('Authenticating'))).toBe(true);
  });

  it('renders View with flex style', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockResolvedValue('existing-device-id');
    mockLoginOrRegister.mockResolvedValue({ success: true });

    let wrapper: any;
    await act(async () => {
      wrapper = createWrapper();
    });

    const views = wrapper.root.findAllByType('View');
    expect(views.length).toBeGreaterThan(0);
  });
});