import { defineConfig, js, ts } from '@rslint/core';

export default defineConfig([
  js.configs.recommended,
  ts.configs.recommended,
  {
    files: ['e2e/**/*', 'examples/**/*'],
    rules: {
      'no-unassigned-vars': 'off',
      'no-undef': 'off',
    },
  },
]);
