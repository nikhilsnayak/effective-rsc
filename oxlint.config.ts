import { recommended } from '@effect/tsgo/oxlint-presets';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [recommended],
  ignorePatterns: ['**/routeTree.gen.ts', 'repos/**', '**/node_modules/**', '**/dist/**'],
  plugins: [
    'eslint',
    'typescript',
    'unicorn',
    'react',
    'react-perf',
    'oxc',
    'import',
    'jsx-a11y',
    'promise',
    'node',
  ],
  options: {
    typeAware: true,
    typeCheck: true,
  },
  overrides: [
    {
      files: [
        'apps/web/**/*.ts',
        'apps/web/**/*.tsx',
        'apps/mobile/**/*.ts',
        'apps/mobile/**/*.tsx',
      ],
      rules: {
        'effecttsgo/async-function': 'off',
        'effecttsgo/crypto-random-uuid': 'off',
      },
    },
  ],
});
