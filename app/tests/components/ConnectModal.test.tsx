import React from 'react';
import { TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import ConnectModal from '../../src/components/ConnectModal';

function findTouchableByText(root: any, text: string) {
  return root.findAllByType(TouchableOpacity).find((btn: any) => {
    const texts = btn.findAllByType('Text');
    return texts.some((t: any) => t.props.children === text);
  });
}

function findConfirmButton(root: any) {
  return root.findAllByType(TouchableOpacity).find((btn: any) => {
    const texts = btn.findAllByType('Text');
    return texts.some((t: any) => t.props.children === 'Connect');
  });
}

describe('ConnectModal', () => {
  const mockOnClose = jest.fn();
  const mockOnConfirm = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly when visible', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <ConnectModal visible onClose={mockOnClose} onConfirm={mockOnConfirm} />
      );
    });

    expect(component).toBeDefined();
    const texts = component.root.findAllByType('Text');
    const contents = texts.map((t: any) => t.props.children);
    expect(contents).toContain('Connect to Map');
    expect(contents).toContain('Range');
    expect(contents).toContain('Duration');
  });

  it('renders all range options', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <ConnectModal visible onClose={mockOnClose} onConfirm={mockOnConfirm} />
      );
    });

    const texts = component.root.findAllByType('Text');
    const contents = texts.map((t: any) => t.props.children);
    expect(contents).toContain('500 m');
    expect(contents).toContain('1 km');
    expect(contents).toContain('2 km');
  });

  it('renders all duration options', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <ConnectModal visible onClose={mockOnClose} onConfirm={mockOnConfirm} />
      );
    });

    const texts = component.root.findAllByType('Text');
    const contents = texts.map((t: any) => t.props.children);
    expect(contents).toContain('30 min');
    expect(contents).toContain('1 h');
    expect(contents).toContain('2 h');
  });

  it('confirm button is disabled when nothing selected', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <ConnectModal visible onClose={mockOnClose} onConfirm={mockOnConfirm} />
      );
    });

    const confirmButton = findConfirmButton(component.root);
    expect(confirmButton).toBeDefined();
    expect(confirmButton.props.disabled).toBe(true);
  });

  it('calls onConfirm when both options selected and confirm pressed', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <ConnectModal visible onClose={mockOnClose} onConfirm={mockOnConfirm} />
      );
    });

    // Select range "500 m"
    const rangePill = findTouchableByText(component.root, '500 m');
    act(() => rangePill.props.onPress());

    // Select duration "30 min"
    const durationPill = findTouchableByText(component.root, '30 min');
    act(() => durationPill.props.onPress());

    // Confirm button is now enabled
    const confirmBtn = findConfirmButton(component.root);
    expect(confirmBtn.props.disabled).toBe(false);

    act(() => confirmBtn.props.onPress());

    expect(mockOnConfirm).toHaveBeenCalledWith(500, 30);
  });

  it('calls onClose when overlay pressed', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <ConnectModal visible onClose={mockOnClose} onConfirm={mockOnConfirm} />
      );
    });

    // The outer TouchableWithoutFeedback is the overlay (calls onClose)
    const touchables = component.root.findAllByType(TouchableWithoutFeedback);
    expect(touchables.length).toBeGreaterThanOrEqual(1);

    // The first TouchableWithoutFeedback wraps the overlay and has onPress={handleClose}
    act(() => touchables[0].props.onPress());

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('does not call onConfirm when only range selected', () => {
    let component: any;
    act(() => {
      component = renderer.create(
        <ConnectModal visible onClose={mockOnClose} onConfirm={mockOnConfirm} />
      );
    });

    // Select range only
    const rangePill = findTouchableByText(component.root, '500 m');
    act(() => rangePill.props.onPress());

    // Confirm should still be disabled
    const confirmBtn = findConfirmButton(component.root);
    expect(confirmBtn.props.disabled).toBe(true);
    act(() => confirmBtn.props.onPress());

    expect(mockOnConfirm).not.toHaveBeenCalled();
  });
});
