module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"], // Look for tests and source files in the src directory
  testMatch: [
    // Pattern to discover test files
    "**/tests/**/*.+(ts|tsx|js)",
    "**/?(*.)+(spec|test).+(ts|tsx|js)",
  ],
  transform: {
    // How to transform files before testing
    "^.+.(ts|tsx)$": "ts-jest",
  },
  moduleNameMapper: {
    // If you use path aliases in tsconfig.json, map them here
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'], // Optional: for global test setup
  // coverageThreshold: { // Optional: enforce code coverage
  //   global: {
  //     branches: 80,
  //     functions: 80,
  //     lines: 80,
  //     statements: -10
  //   }
  // }
};
