/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  // `server-only` throws under plain Node require() outside a bundler's server aliasing
  // (see src/filing-contribution-pack-validate.ts) — stub it so tests can exercise the
  // Ajv validator directly. FIR-579/FIR-584 runtime-domain boundary.
  moduleNameMapper: {
    '^server-only$': '<rootDir>/test/mocks/server-only.js',
  },
};
