import { pluginReact } from '@rsbuild/plugin-react';
import { defineConfig } from '@rslib/core';

const PanelExternals = [/^(?:effect|react|react-dom)(?:\/.*)?$/];

export default defineConfig({
  lib: [
    {
      bundle: false,
      dts: {
        bundle: false,
        tsgo: true,
      },
      format: 'esm',
      source: {
        entry: {
          index: ['src/**', '!src/dev/panel.tsx'],
        },
      },
      syntax: 'es2022',
    },
    {
      bundle: true,
      format: 'esm',
      output: {
        externals: PanelExternals,
        filename: {
          js: '[name].js',
        },
        target: 'web',
      },
      source: {
        entry: {
          'dev/panel': './src/dev/panel.tsx',
        },
      },
      syntax: 'es2022',
      tools: {
        rspack: {
          module: {
            rules: [
              {
                resourceQuery: /raw/,
                type: 'asset/source',
              },
            ],
          },
        },
      },
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
