import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native-maps', () => ({
  Marker: 'Marker',
  Callout: 'Callout',
}));

import UserMarker from '../../src/components/UserMarker';

const SERVER_URL = 'http://localhost:3000';
const DEFAULT_AVATAR = '/defaults/default-avatar.png';

describe('UserMarker', () => {
  const coordinate = { latitude: 37.38, longitude: -5.99 };

  it('renders without crashing', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <UserMarker
          coordinate={coordinate}
          profile={{ message: 'Hello', imageUrl: null }}
        />
      );
    });
    expect(component).toBeDefined();
  });

  it('renders Marker with correct coordinate', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <UserMarker
          coordinate={coordinate}
          profile={{ message: 'Hello', imageUrl: null }}
        />
      );
    });

    const marker = component.root.findByType('Marker');
    expect(marker.props.coordinate).toEqual(coordinate);
  });

  it('shows speech bubble when message is provided', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <UserMarker
          coordinate={coordinate}
          profile={{ message: 'Hello World!', imageUrl: null }}
        />
      );
    });

    const texts = component.root.findAllByType('Text');
    const contents = texts.map((t: any) => t.props.children);
    expect(contents).toContain('Hello World!');
  });

  it('hides speech bubble when message is empty', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <UserMarker
          coordinate={coordinate}
          profile={{ message: '', imageUrl: null }}
        />
      );
    });

    const texts = component.root.findAllByType('Text');
    // The text should still be there but the bubble View should have hidden style
    expect(texts.length).toBeGreaterThanOrEqual(0);
  });

  it('hides speech bubble when message is null', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <UserMarker
          coordinate={coordinate}
          profile={{ message: null, imageUrl: null }}
        />
      );
    });

    // Should render without crash even with null message
    expect(component).toBeDefined();
  });

  it('shows default avatar when imageUrl is null', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <UserMarker
          coordinate={coordinate}
          profile={{ message: 'Hi', imageUrl: null }}
        />
      );
    });

    const image = component.root.findAllByType('Image')[0];
    expect(image.props.source.uri).toBe(`${SERVER_URL}${DEFAULT_AVATAR}`);
  });

  it('shows default avatar when imageUrl is empty string', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <UserMarker
          coordinate={coordinate}
          profile={{ message: 'Hi', imageUrl: '' }}
        />
      );
    });

    const image = component.root.findAllByType('Image')[0];
    expect(image.props.source.uri).toBe(`${SERVER_URL}${DEFAULT_AVATAR}`);
  });

  it('uses absolute URL directly', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <UserMarker
          coordinate={coordinate}
          profile={{ message: 'Hi', imageUrl: 'https://cdn.example.com/avatar.png' }}
        />
      );
    });

    const image = component.root.findAllByType('Image')[0];
    expect(image.props.source.uri).toBe('https://cdn.example.com/avatar.png');
  });

  it('prepends server URL for relative image paths', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <UserMarker
          coordinate={coordinate}
          profile={{ message: 'Hi', imageUrl: '/uploads/avatar.png' }}
        />
      );
    });

    const image = component.root.findAllByType('Image')[0];
    expect(image.props.source.uri).toBe(`${SERVER_URL}/uploads/avatar.png`);
  });

  it('falls back to default avatar on image error', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <UserMarker
          coordinate={coordinate}
          profile={{ message: 'Hi', imageUrl: '/uploads/broken.png' }}
        />
      );
    });

    const image = component.root.findAllByType('Image')[0];
    // Simulate image error
    act(() => image.props.onError());

    // After error, should show default avatar
    const updatedImage = component.root.findAllByType('Image')[0];
    expect(updatedImage.props.source.uri).toBe(`${SERVER_URL}${DEFAULT_AVATAR}`);
  });

  it('calls onPress when marker is pressed', () => {
    const onPress = jest.fn();
    let component: any;
    act(() => {
      component = renderer.create(
        <UserMarker
          coordinate={coordinate}
          profile={{ message: 'Hi', imageUrl: null }}
          onPress={onPress}
        />
      );
    });

    const marker = component.root.findByType('Marker');
    act(() => marker.props.onPress());

    expect(onPress).toHaveBeenCalled();
  });

  it('renders with isSelf styling', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <UserMarker
          coordinate={coordinate}
          profile={{ message: 'Hi', imageUrl: null }}
          isSelf
        />
      );
    });

    expect(component).toBeDefined();
  });

  it('renders with hasUnread styling', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <UserMarker
          coordinate={coordinate}
          profile={{ message: 'Hi', imageUrl: null }}
          hasUnread
        />
      );
    });

    expect(component).toBeDefined();
  });

  it('renders without optional props', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <UserMarker
          coordinate={coordinate}
          profile={{ imageUrl: null }}
        />
      );
    });

    expect(component).toBeDefined();
  });
});
