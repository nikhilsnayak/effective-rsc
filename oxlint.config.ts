import { recommended } from '@effect/tsgo/oxlint-presets';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [recommended],
  ignorePatterns: [
    '**/.ersc/**',
    '**/coverage/**',
    '**/dist/**',
    '**/node_modules/**',
    'vendor/**',
  ],
  jsPlugins: ['./tooling/oxlint/ersc-plugin.js'],
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
  rules: {
    curly: 'error',
    'ersc/no-inline-yield': 'error',
    'react/function-component-definition': [
      'error',
      {
        namedComponents: 'function-declaration',
        unnamedComponents: 'function-expression',
      },
    ],
  },
  options: {
    typeAware: true,
    typeCheck: true,
  },
});
