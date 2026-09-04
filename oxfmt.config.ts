import { defineConfig } from 'oxfmt';

export default defineConfig({
  ignorePatterns: ['**/.ersc/**', '**/coverage/**', '**/dist/**', 'vendor/**'],
  singleQuote: true,
  jsxSingleQuote: true,
  sortImports: true,
  sortTailwindcss: true,
  sortPackageJson: true,
});
