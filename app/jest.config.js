module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.test.(ts|tsx)'],
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/.expo/**',
    '!**/ios/**',
    '!**/android/**',
    '!**/*.test.{ts,tsx}',
    '!**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['lcov', 'text'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|expo(nent)?|@expo(nent)?/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@react-navigation/.*|react-navigation))',
  ],
  setupFiles: ['./jest.setup.js'],
};