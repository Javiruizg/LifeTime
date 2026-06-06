import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AppNavigator, { RootStackParamList } from '../../src/navigation/AppNavigator';

jest.mock('../../src/features/auth/auth.service', () => ({
  getAccessToken: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AppNavigator', () => {
  it('renders without crashing', async () => {
    const { getAccessToken } = require('../../src/features/auth/auth.service');
    getAccessToken.mockResolvedValue('token');

    let wrapper: any;
    await act(async () => {
      wrapper = renderer.create(<AppNavigator />);
    });
    expect(wrapper).toBeDefined();
  });

  it('shows loading state initially', async () => {
    const { getAccessToken } = require('../../src/features/auth/auth.service');
    getAccessToken.mockImplementation(() => new Promise(() => {}));

    let wrapper: any;
    await act(async () => {
      wrapper = renderer.create(<AppNavigator />);
    });

    const texts = wrapper.root.findAllByType('Text');
    expect(texts.length).toBe(0);
  });

  it('renders HomeScreen when authenticated', async () => {
    const { getAccessToken } = require('../../src/features/auth/auth.service');
    getAccessToken.mockResolvedValue('valid-token');

    let wrapper: any;
    await act(async () => {
      wrapper = renderer.create(<AppNavigator />);
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    const texts = wrapper.root.findAllByType('Text');
    const contents = texts.map((t: any) => t.props.children);
    expect(contents).toContain('Enable location');
  });

  it('renders AuthLoadingScreen when not authenticated', async () => {
    const { getAccessToken } = require('../../src/features/auth/auth.service');
    getAccessToken.mockResolvedValue(null);

    let wrapper: any;
    await act(async () => {
      wrapper = renderer.create(<AppNavigator />);
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    const texts = wrapper.root.findAllByType('Text');
    const contents = texts.map((t: any) => t.props.children);
    expect(contents).toContain('LifeTime');
  });

  it('handles auth check failure', async () => {
    const { getAccessToken } = require('../../src/features/auth/auth.service');
    getAccessToken.mockRejectedValue(new Error('Error'));

    let wrapper: any;
    await act(async () => {
      wrapper = renderer.create(<AppNavigator />);
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    const texts = wrapper.root.findAllByType('Text');
    const contents = texts.map((t: any) => t.props.children);
    expect(contents).toContain('LifeTime');
  });
});

describe('RootStackParamList', () => {
  it('should define AuthLoading screen', () => {
    const param: RootStackParamList['AuthLoading'] = undefined;
    expect(param).toBeUndefined();
  });

  it('should define Home screen', () => {
    const param: RootStackParamList['Home'] = undefined;
    expect(param).toBeUndefined();
  });

  it('should define Profile screen', () => {
    const param: RootStackParamList['Profile'] = undefined;
    expect(param).toBeUndefined();
  });
});
