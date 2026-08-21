import { defineConfig } from 'oxfmt';

export default defineConfig({
  ignorePatterns: ['**/.ersc/**', '**/coverage/**', '**/dist/**', 'repos/**'],
  singleQuote: true,
  jsxSingleQuote: true,
  sortImports: true,
  sortTailwindcss: true,
  sortPackageJson: true,
});
