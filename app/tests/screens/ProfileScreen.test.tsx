import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockProfile = {
  id: 1,
  userId: 1,
  name: 'Test User',
  message: 'Hello world',
  imageUrl: '/uploads/avatar.png',
};

jest.mock('../../src/features/profile/profile.service', () => ({
  getMyProfile: jest.fn(),
  updateProfile: jest.fn(),
}));

jest.mock('../../src/shared/lib/api', () => ({
  api: {
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('@expo/vector-icons', () => ({
  Feather: 'Feather',
}));

function findSaveButton(root: any): any {
  const texts = root.findAllByType('Text');
  for (const t of texts) {
    if (t.props.children === 'Save') {
      let node = t.parent;
      while (node) {
        if (node.props?.onPress) return node;
        node = node.parent;
      }
    }
  }
  return null;
}

describe('ProfileScreen', () => {
  let getMyProfile: jest.Mock;
  let updateProfile: jest.Mock;
  let api: any;
  let ImagePicker: any;
  let mountedRenderers: any[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    mountedRenderers = [];

    getMyProfile = require('../../src/features/profile/profile.service').getMyProfile;
    updateProfile = require('../../src/features/profile/profile.service').updateProfile;
    api = require('../../src/shared/lib/api').api;
    ImagePicker = require('expo-image-picker');

    getMyProfile.mockResolvedValue(mockProfile);
    updateProfile.mockResolvedValue(mockProfile);
    api.post.mockResolvedValue({ data: { imageUrl: '/uploads/new-avatar.png' } });
    api.delete.mockResolvedValue({});
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://test/photo.jpg', mimeType: 'image/jpeg' }],
    });
  });

  afterEach(() => {
    for (const r of mountedRenderers) {
      r.unmount();
    }
  });

  async function renderAndTrack(): Promise<any> {
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    let r: any;
    await act(async () => {
      r = renderer.create(<ProfileScreen />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    mountedRenderers.push(r);
    return r;
  }

  it('renders loading state', () => {
    getMyProfile.mockImplementation(() => new Promise(() => {}));
    const ProfileScreen = require('../../src/screens/ProfileScreen').default;
    let r: any;
    act(() => { r = renderer.create(<ProfileScreen />); });
    mountedRenderers.push(r);
    expect(r.root.findAllByType('LinearGradient').length).toBeGreaterThan(0);
    expect(r.root.findAllByType('ActivityIndicator').length).toBe(1);
  });

  it('renders profile not found on null or error', async () => {
    getMyProfile.mockResolvedValue(null);
    let c = await renderAndTrack();
    expect(c.root.findAllByType('Text').map((t: any) => t.props.children)).toContain('Profile not found');

    getMyProfile.mockRejectedValue(new Error('x'));
    c = await renderAndTrack();
    expect(c.root.findAllByType('Text').map((t: any) => t.props.children)).toContain('Profile not found');
  });

  it('renders profile with all structural elements and icons', async () => {
    const c = await renderAndTrack();
    const contents = c.root.findAllByType('Text').map((t: any) => t.props.children);
    expect(contents).toContain('NAME');
    expect(contents).toContain('Save');
    expect(contents).toContain('👤');
    expect(c.root.findAllByType('Image').length).toBeGreaterThan(0);
    expect(c.root.findAllByType('TextInput').length).toBe(2);
    expect(c.root.findAllByType('Feather').length).toBeGreaterThan(0);
    const feathers = c.root.findAllByType('Feather');
    expect(feathers.find((f: any) => f.props.name === 'edit-2')).toBeDefined();
    expect(feathers.find((f: any) => f.props.name === 'trash-2')).toBeDefined();
  });

  it('saves profile successfully and shows notification', async () => {
    const c = await renderAndTrack();
    const inputs = c.root.findAllByType('TextInput');

    await act(async () => {
      inputs[1].props.onChangeText('New Name');
      await new Promise((r) => setTimeout(r, 0));
    });

    const saveBtn = findSaveButton(c.root);
    await act(async () => {
      saveBtn.props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(updateProfile).toHaveBeenCalledWith({ name: 'New Name', message: 'Hello world' });
    expect(c.root.findAllByType('Text').map((t: any) => t.props.children)).toContain('Profile saved!');
    expect(c.root.findAllByType('Feather').find((f: any) => f.props.name === 'check-circle')).toBeDefined();
  });

  it('shows error notification with alert-circle when name is empty', async () => {
    const c = await renderAndTrack();
    const inputs = c.root.findAllByType('TextInput');

    await act(async () => {
      inputs[1].props.onChangeText('');
      await new Promise((r) => setTimeout(r, 0));
    });

    const saveBtn = findSaveButton(c.root);
    await act(async () => {
      saveBtn.props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(c.root.findAllByType('Text').map((t: any) => t.props.children)).toContain('Name cannot be empty');
    expect(c.root.findAllByType('Feather').find((f: any) => f.props.name === 'alert-circle')).toBeDefined();
  });

  it('shows ActivityIndicator on save button while saving', async () => {
    const c = await renderAndTrack();
    const inputs = c.root.findAllByType('TextInput');

    await act(async () => {
      inputs[1].props.onChangeText('Valid');
      await new Promise((r) => setTimeout(r, 0));
    });

    updateProfile.mockImplementation(() => new Promise(() => {}));
    const saveBtn = findSaveButton(c.root);
    await act(async () => {
      saveBtn.props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(c.root.findAllByType('Text').map((t: any) => t.props.children)).not.toContain('Save');
  });

  it('speech bubble TextInput updates value on changeText', async () => {
    const c = await renderAndTrack();
    await act(async () => {
      c.root.findAllByType('TextInput')[0].props.onChangeText('New message');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(c.root.findAllByType('TextInput')[0].props.value).toBe('New message');
  });

  it('clears error notification when typing in name field', async () => {
    const c = await renderAndTrack();
    const inputs = c.root.findAllByType('TextInput');
    const saveBtn = findSaveButton(c.root);

    await act(async () => {
      inputs[1].props.onChangeText('');
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      saveBtn.props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(c.root.findAllByType('Text').map((t: any) => t.props.children)).toContain('Name cannot be empty');

    await act(async () => {
      c.root.findAllByType('TextInput')[1].props.onChangeText('A');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(c.root.findAllByType('Text').map((t: any) => t.props.children)).not.toContain('Name cannot be empty');
  });

  it('uploads image when edit avatar is pressed', async () => {
    const c = await renderAndTrack();
    api.post.mockClear();

    const editIcon = c.root.findAllByType('Feather').find((f: any) => f.props.name === 'edit-2');
    let editNode = editIcon.parent;
    while (editNode && !editNode.props?.onPress) editNode = editNode.parent;

    await act(async () => {
      editNode.props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(api.post).toHaveBeenCalledWith(
      '/upload/profile',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  });

  it('does not upload when picker is canceled', async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] });
    const c = await renderAndTrack();
    api.post.mockClear();

    const editIcon = c.root.findAllByType('Feather').find((f: any) => f.props.name === 'edit-2');
    let editNode = editIcon.parent;
    while (editNode && !editNode.props?.onPress) editNode = editNode.parent;

    await act(async () => {
      editNode.props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('handles imageUrl correctly for null, absolute, and relative paths', async () => {
    getMyProfile.mockResolvedValue({ ...mockProfile, imageUrl: null });
    let c = await renderAndTrack();
    expect(c.root.findAllByType('Image')[0].props.source.uri).toContain('default-avatar');

    getMyProfile.mockResolvedValue({ ...mockProfile, imageUrl: 'https://cdn.example.com/avatar.png' });
    c = await renderAndTrack();
    expect(c.root.findAllByType('Image')[0].props.source.uri).toBe('https://cdn.example.com/avatar.png');

    getMyProfile.mockResolvedValue({ ...mockProfile, imageUrl: '/uploads/test.png' });
    c = await renderAndTrack();
    expect(c.root.findAllByType('Image')[0].props.source.uri).toContain('/uploads/test.png');
  });
});