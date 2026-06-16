const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  // CORREÇÃO: era "setupFilesAfterFramework" (typo) → "setupFilesAfterFramework" não existe
  // o correto é "setupFilesAfterFramework" → não, é "setupFilesAfterFramework"
  // Jest usa: setupFilesAfterFramework → ERRADO; correto: setupFilesAfterFramework → ainda errado
  // O correto é: setupFilesAfterEnv
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/e2e/',
  ],

  // Projetos separados: componentes React usam jsdom, services usam node
  projects: [
    {
      displayName: 'unit:services',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/tests/**/*.test.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
          tsconfig: { jsx: 'react-jsx' },
        }],
      },
    },
    {
      displayName: 'unit:components',
      testEnvironment: 'jest-environment-jsdom',
      testMatch: ['<rootDir>/src/components/**/*.test.tsx'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
    },
  ],
}

module.exports = createJestConfig(customJestConfig)