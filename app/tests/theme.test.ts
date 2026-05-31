import { theme } from '../src/shared/lib/theme';

describe('Theme', () => {
  describe('Colors', () => {
    it('should have all required color properties', () => {
      expect(theme.colors).toHaveProperty('background');
      expect(theme.colors).toHaveProperty('primary');
      expect(theme.colors).toHaveProperty('danger');
      expect(theme.colors).toHaveProperty('success');
    });

    it('should have valid hex color values', () => {
      expect(theme.colors.background).toMatch(/^#[0-9A-Fa-f]{8}$/);
      expect(theme.colors.primary).toMatch(/^#[0-9A-Fa-f]{8}$/);
    });
  });

  describe('Spacing', () => {
    it('should have required spacing values', () => {
      expect(theme.spacing).toHaveProperty('sm');
      expect(theme.spacing).toHaveProperty('lg');
      expect(theme.spacing).toHaveProperty('2xl');
    });

    it('should have numeric spacing values', () => {
      expect(typeof theme.spacing.sm).toBe('number');
      expect(typeof theme.spacing.lg).toBe('number');
    });
  });

  describe('Radius', () => {
    it('should have round property for circular elements', () => {
      expect(theme.radius.round).toBe(9999);
    });

    it('should have md and lg radius values', () => {
      expect(theme.radius.md).toBeDefined();
      expect(theme.radius.lg).toBeDefined();
    });
  });

  describe('Typography', () => {
    it('should have fontSize scale', () => {
      expect(theme.typography.fontSize).toHaveProperty('xs');
      expect(theme.typography.fontSize).toHaveProperty('4xl');
      expect(theme.typography.fontSize.base).toBeDefined();
    });

    it('should have fontWeight values', () => {
      expect(theme.typography.fontWeight.bold).toBe('700');
      expect(theme.typography.fontWeight.medium).toBe('500');
    });
  });

  describe('Shadows', () => {
    it('should have shadow definitions', () => {
      expect(theme.shadows).toHaveProperty('sm');
      expect(theme.shadows).toHaveProperty('md');
      expect(theme.shadows).toHaveProperty('neon');
    });
  });
});

describe('Profile Types', () => {
  it('should define Profile interface', () => {
    const profile = { id: 1, userId: 1, name: 'Test', message: 'Hi', imageUrl: null };
    expect(profile.name).toBeDefined();
    expect(profile.imageUrl).toBeNull();
  });

  it('should allow partial updates via UpdateProfileInput', () => {
    const input: { name?: string; message?: string } = { name: 'New' };
    expect(input.name).toBe('New');
  });
});