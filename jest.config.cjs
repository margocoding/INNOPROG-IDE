module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  moduleNameMapper: {
    '^react-router-dom$': '<rootDir>/src/test-mocks/react-router-dom.ts',
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(yjs|lib0|y-protocols|y-codemirror.next|@codemirror|@marijn|style-mod|w3c-keyname|crelt)/)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/index.tsx',
    '!src/reportWebVitals.ts',
    '!src/setupTests.ts',
    '!src/test-mocks/**',
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      lines: 80,
      functions: 78,
      branches: 67,
    },
  },
  coverageReporters: ['text', 'html', 'lcov', 'json-summary'],
};
