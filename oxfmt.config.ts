import { defineConfig } from 'oxfmt';

/**
 * Mirrors the prettier config this replaces, option for option, so the reformat
 * is oxfmt-vs-prettier differences only and not a settings change on top.
 *
 * `sortImports` stands in for prettier-plugin-organize-imports. Dropped along
 * with prettier: prettier-plugin-tailwindcss, whose class sorting has no oxfmt
 * equivalent — better-tailwindcss's canonical-class rules cover much of the
 * same ground from the lint side.
 */
export default defineConfig({
  semi: true,
  printWidth: 120,
  trailingComma: 'es5',
  singleQuote: true,
  jsxSingleQuote: false,
  tabWidth: 2,
  sortImports: true,
  // oxfmt does not honour .gitignore, unlike the prettier invocation this
  // replaces (`--ignore-path .gitignore`), so generated and vendored trees have
  // to be named here or a local format:check after a build fails on files
  // nobody wrote.
  ignorePatterns: [
    'pnpm-lock.yaml',
    'node_modules/',
    'dist/',
    'dist-*/',
    'storybook-static/',
    'coverage/',
    '**/__fixtures__/',
    '.claude/',
  ],
  overrides: [
    {
      files: ['tsconfig*.json'],
      options: { trailingComma: 'none' },
    },
  ],
});
