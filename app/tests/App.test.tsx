import React from 'react';
import renderer, { act } from 'react-test-renderer';
import App from '../App';

describe('App', () => {
  it('renders without crashing', async () => {
    let tree;

    await act(async () => {
      tree = renderer.create(<App />).toJSON();
    });

    expect(tree).toBeDefined();
  });
});