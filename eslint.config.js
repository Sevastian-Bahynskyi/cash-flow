const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
const tseslint = require('typescript-eslint');

const typedFiles = ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'];

module.exports = defineConfig([
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'android/**',
      'ios/**',
      'coverage/**',
      'dist/**',
      'supabase/functions/**',
    ],
  },
  ...expo,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: typedFiles,
  })),
  {
    files: typedFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      'no-empty': 'error',
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: false }],
      '@typescript-eslint/no-misused-promises': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['scripts/**/*.{js,cjs,mjs}', '.codex/hooks/**/*.{js,cjs,mjs}', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      'no-empty': 'error',
    },
  },
]);
