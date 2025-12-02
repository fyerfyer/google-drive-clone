module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__test__/**/*.test.ts"],
  setupFilesAfterEnv: ["<rootDir>/src/__test__/setup.ts"],
  testTimeout: 10000,
};
