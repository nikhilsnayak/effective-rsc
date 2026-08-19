import { defineConfig } from 'oxfmt';

export default defineConfig({
  ignorePatterns: ['**/routeTree.gen.ts', '**/repos/**'],
  singleQuote: true,
  jsxSingleQuote: true,
  sortImports: true,
  sortTailwindcss: true,
  sortPackageJson: true,
});
