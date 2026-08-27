import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      bundle: true,
      format: 'esm',
      syntax: 'es2022',
    },
  ],
  output: {
    cleanDistPath: true,
    filename: {
      js: '[name].js',
    },
    minify: false,
    sourceMap: true,
    target: 'node',
  },
  source: {
    entry: {
      cli: './src/cli.ts',
    },
    tsconfigPath: './tsconfig.json',
  },
});
