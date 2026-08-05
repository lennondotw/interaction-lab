import eslintJsPlugin from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginBetterTailwindcss from 'eslint-plugin-better-tailwindcss';
import * as mdx from 'eslint-plugin-mdx';
import prettierPlugin from 'eslint-plugin-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactRefreshPlugin from 'eslint-plugin-react-refresh';
import storybook from 'eslint-plugin-storybook';
import tsEslint from 'typescript-eslint';
import { fileURLToPath } from 'url';

/** @type {string[]} */
const MDX_FILES = ['**/{,.}*.mdx'];

/** @type {string[]} */
const MDX_VIRTUAL_TS_FILES = ['**/{,.}*.mdx/**/{,.}*.{,c,m}{j,t}s{,x}'];

/** @type {string[]} */
const TS_FILES = ['**/{,.}*.{,c,m}{j,t}s{,x}'];

/** @type {string[]} */
const STORYBOOK_FILES = ['**/{,.}*.stories.{,c,m}{j,t}s{,x}'];

/** @type {string[]} */
const STORYBOOK_MAIN_FILES = ['**/.storybook/main.{,c,m}{j,t}s'];

const labAppPath = new URL('./lab/', import.meta.url);
const tailwindCssStylesheetPath = new URL('./packages/tailwindcss/tailwindcss.css', import.meta.url);

/**
 * @type {import('eslint').Linter.Config[]}
 */
const eslintConfig = [
  // config for all
  // `archive/` holds frozen investigation probes: standalone scripts, outside
  // every tsconfig, kept runnable rather than kept current. See archive/README.md.
  // `.claude/` holds agent worktrees: full stale checkouts with their own
  // node_modules and eslint.config.mjs. ESLint 10 resolves config from the
  // linted file's directory, so leaving them in loads a second copy of every
  // plugin against a different eslint major.
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/dist-*/',
      '**/storybook-static/',
      '**/__fixtures__/',
      'archive/',
      '.claude/',
    ],
  },
  { linterOptions: { reportUnusedDisableDirectives: true } },

  // parser for javascript/typescript code
  {
    languageOptions: {
      parser: /** @type {any} */ (tsEslint.parser),
      parserOptions: /** @satisfies {import('@typescript-eslint/types').ParserOptions} */ ({
        projectService: true,
      }),
    },
    ignores: MDX_VIRTUAL_TS_FILES,
    files: TS_FILES,
  },

  // config for javascript/typescript code
  {
    rules: {
      ...eslintJsPlugin.configs.recommended.rules,
      'no-undef': 'off',
    },
    ignores: MDX_VIRTUAL_TS_FILES,
    files: TS_FILES,
  },
  {
    plugins: {
      '@typescript-eslint': /** @type {any} */ (tsEslint.plugin),
    },
    rules: {
      ...tsEslint.configs.strictTypeChecked[2]?.rules,
      ...tsEslint.configs.stylisticTypeChecked[2]?.rules,
    },
    ignores: MDX_VIRTUAL_TS_FILES,
    files: TS_FILES,
  },
  {
    plugins: {
      'react-hooks': /** @type {any} */ (reactHooksPlugin),
      'react-refresh': reactRefreshPlugin,
      react: reactPlugin,
      'better-tailwindcss': eslintPluginBetterTailwindcss,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      ...reactHooksPlugin.configs['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      ...eslintPluginBetterTailwindcss.configs['recommended-warn'].rules,
      ...eslintPluginBetterTailwindcss.configs['recommended-error'].rules,
    },
    settings: {
      react: { version: '19.1.0' },
      'better-tailwindcss': {
        entryPoint: fileURLToPath(tailwindCssStylesheetPath),
      },
    },
    ignores: MDX_VIRTUAL_TS_FILES,
    files: TS_FILES,
  },

  // config for storybook files
  {
    plugins: {
      storybook: /** @type {any} */ (storybook),
    },
    ignores: MDX_VIRTUAL_TS_FILES,
    files: [STORYBOOK_FILES, STORYBOOK_MAIN_FILES],
  },
  {
    rules: {
      ...storybook.configs['flat/recommended'][1]?.rules,
    },
    ignores: MDX_VIRTUAL_TS_FILES,
    files: STORYBOOK_FILES,
  },
  {
    rules: {
      ...storybook.configs['flat/recommended'][2]?.rules,
      'storybook/no-uninstalled-addons': [
        'error',
        { packageJsonLocation: fileURLToPath(new URL('package.json', labAppPath)) },
      ],
    },
    ignores: MDX_VIRTUAL_TS_FILES,
    files: STORYBOOK_MAIN_FILES,
  },

  // config for javascript/typescript code
  {
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-confusing-void-expression': 'off',
      'better-tailwindcss/enforce-consistent-line-wrapping': ['warn', { printWidth: 120 }],
    },
    ignores: MDX_VIRTUAL_TS_FILES,
    files: TS_FILES,
  },

  // prettier config
  {
    // disable internal eslint rules that might conflict with prettier
    rules: eslintConfigPrettier.rules,
    ignores: MDX_VIRTUAL_TS_FILES,
    files: TS_FILES,
  },
  {
    plugins: { prettier: prettierPlugin },
    files: [...TS_FILES, ...MDX_FILES, ...MDX_VIRTUAL_TS_FILES],
  },
  {
    rules: { 'prettier/prettier': 'error' },
    files: [...TS_FILES, ...MDX_FILES, ...MDX_VIRTUAL_TS_FILES],
  },

  // config for mdx
  {
    plugins: { mdx: mdx },
    languageOptions: mdx.flat.languageOptions,
    processor: mdx.createRemarkProcessor({ lintCodeBlocks: true }),
    rules: {
      ...mdx.flat.rules,
    },
    files: MDX_FILES,
  },

  // config for mdx code blocks (disabled for now)
  {
    languageOptions: {
      ...mdx.flatCodeBlocks.languageOptions,
    },
    rules: {
      ...mdx.flatCodeBlocks.rules,
    },
    files: MDX_VIRTUAL_TS_FILES,
  },
];

export default eslintConfig;
