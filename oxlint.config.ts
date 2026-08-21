import { recommended } from '@effect/tsgo/oxlint-presets';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [recommended],
  ignorePatterns: ['**/.ersc/**', '**/coverage/**', '**/dist/**', '**/node_modules/**', 'repos/**'],
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
});
