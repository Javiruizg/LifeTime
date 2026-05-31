import React from 'react';
import renderer, { act } from 'react-test-renderer';
import HomeScreen from '../../src/screens/HomeScreen';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('HomeScreen', () => {
  it('renders without crashing', () => {
    const navigation = { navigate: jest.fn() } as any;
    let component: any;
    act(() => {
      component = renderer.create(<HomeScreen navigation={navigation} />);
    });
    expect(component).toBeDefined();
  });

  it('renders Text component with main content', () => {
    const navigation = { navigate: jest.fn() } as any;
    let component: any;
    act(() => {
      component = renderer.create(<HomeScreen navigation={navigation} />);
    });
    const texts = component.root.findAllByType('Text');
    const contents = texts.map((t: any) => t.props.children);
    expect(contents).toContain('Este es el home');
  });

  it('renders profile navigation text', () => {
    const navigation = { navigate: jest.fn() } as any;
    let component: any;
    act(() => {
      component = renderer.create(<HomeScreen navigation={navigation} />);
    });
    const texts = component.root.findAllByType('Text');
    const contents = texts.map((t: any) => t.props.children);
    expect(contents).toContain('Mi Perfil');
  });

  it('has View container', () => {
    const navigation = { navigate: jest.fn() } as any;
    let component: any;
    act(() => {
      component = renderer.create(<HomeScreen navigation={navigation} />);
    });
    const views = component.root.findAllByType('View');
    expect(views.length).toBeGreaterThan(0);
  });
});