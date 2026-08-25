import { pluginReact } from '@rsbuild/plugin-react';
import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      bundle: false,
      dts: {
        bundle: false,
        tsgo: true,
      },
      format: 'esm',
      syntax: 'es2022',
    },
  ],
  output: {
    cleanDistPath: true,
    minify: false,
    sourceMap: true,
    target: 'node',
  },
  plugins: [
    pluginReact({
      swcReactOptions: {
        runtime: 'automatic',
      },
    }),
  ],
  source: {
    tsconfigPath: './tsconfig.json',
  },
});
