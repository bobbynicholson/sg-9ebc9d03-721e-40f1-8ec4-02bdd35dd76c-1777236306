const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // lucide-react ships ESM that Jest's transform doesn't process;
    // stub every icon to a plain <svg> for render tests.
    '^lucide-react$': '<rootDir>/__mocks__/lucide-react.js',
  },
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  // src/pages/** are Next.js routes, not tests. The default testMatch
  // pattern `?(*.)test.ts` greedily matches API routes literally named
  // test.ts (e.g. payment-gateways/[id]/test.ts) which then fail with
  // "your test suite must contain at least one test". Ignore the pages
  // tree for discovery - real tests live in __tests__ / *.test.*.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/src/pages/',
  ],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/__tests__/**',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(lucide-react)/)',
  ],
  coverageThreshold: {
    global: {
      branches: 1,
      functions: 1,
      lines: 1,
      statements: 1,
    },
  },
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)