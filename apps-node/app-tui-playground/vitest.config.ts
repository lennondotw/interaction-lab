import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // A scratch playground: one throwaway script that needs macOS and a real
    // Messages database to do anything, so there is nothing to unit test. The
    // `test` script stays identical to every other package's so the scaffold
    // holds, and vitest's default of failing on an empty run is waived here
    // rather than by special-casing this package in `test:packages`.
    passWithNoTests: true,
  },
});
