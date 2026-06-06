import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  const MockMapView = (props: any) => <View {...props} />;
  MockMapView.displayName = 'MapView';
  return {
    __esModule: true,
    default: MockMapView,
    PROVIDER_DEFAULT: 'default',
  };
});

jest.mock('../../src/components/UserMarker', () => 'UserMarker');

import LiveMap from '../../src/components/LiveMap';

describe('LiveMap', () => {
  const mockProfile = {
    id: 1,
    userId: 1,
    name: 'Test User',
    message: 'Hello!',
    imageUrl: null,
  };

  const mockCoordinate = { latitude: 37.38, longitude: -5.99 };

  it('renders without crashing', () => {
    let component: any;
    act(() => {
      component = renderer.create(<LiveMap />);
    });
    expect(component).toBeDefined();
  });

  it('renders current user marker when currentUser is provided', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <LiveMap
          currentUser={{ profile: mockProfile, coordinate: mockCoordinate }}
        />
      );
    });

    const markers = component.root.findAllByType('UserMarker');
    expect(markers.length).toBe(1);
    expect(markers[0].props.isSelf).toBe(true);
    expect(markers[0].props.coordinate).toEqual(mockCoordinate);
    expect(markers[0].props.profile.message).toBe('Hello!');
  });

  it('renders other user markers when otherUsers are provided', () => {
    const otherUsers = [
      {
        userId: 2,
        profile: { ...mockProfile, id: 2, userId: 2, name: 'Bob', message: 'Hey' },
        coordinate: { latitude: 37.39, longitude: -6.0 },
        hasUnread: true,
      },
      {
        userId: 3,
        profile: { ...mockProfile, id: 3, userId: 3, name: 'Alice', message: '' },
        coordinate: { latitude: 37.4, longitude: -6.01 },
      },
    ];

    let component: any;
    act(() => {
      component = renderer.create(
        <LiveMap
          currentUser={{ profile: mockProfile, coordinate: mockCoordinate }}
          otherUsers={otherUsers}
        />
      );
    });

    const markers = component.root.findAllByType('UserMarker');
    expect(markers.length).toBe(3);

    expect(markers[1].props.isSelf).toBe(false);
    expect(markers[1].props.hasUnread).toBe(true);
    expect(markers[2].props.isSelf).toBe(false);
  });

  it('calls onUserPress when a user marker is pressed', () => {
    const onUserPress = jest.fn();
    const otherUsers = [
      {
        userId: 2,
        profile: { ...mockProfile, id: 2, userId: 2, name: 'Bob', message: 'Hey' },
        coordinate: { latitude: 37.39, longitude: -6.0 },
      },
    ];

    let component: any;
    act(() => {
      component = renderer.create(
        <LiveMap otherUsers={otherUsers} onUserPress={onUserPress} />
      );
    });

    const markers = component.root.findAllByType('UserMarker');
    act(() => markers[0].props.onPress());

    expect(onUserPress).toHaveBeenCalledWith(2);
  });

  it('renders no markers when no users provided', () => {
    let component: any;
    act(() => {
      component = renderer.create(<LiveMap />);
    });

    const markers = component.root.findAllByType('UserMarker');
    expect(markers.length).toBe(0);
  });

  it('renders with forwardRef', () => {
    const ref = React.createRef<any>();
    let component: any;
    act(() => {
      component = renderer.create(<LiveMap ref={ref} />);
    });
    expect(component).toBeDefined();
  });
});
