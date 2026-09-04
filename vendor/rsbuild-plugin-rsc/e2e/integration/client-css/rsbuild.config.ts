import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { Layers, pluginRSC } from 'rsbuild-plugin-rsc';

type NodeHandler = typeof import('./src/framework/entry.rsc').default;

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginRSC({
      layers: {
        ssr: path.join(import.meta.dirname, './src/framework/entry.ssr.tsx'),
      },
    }),
  ],
  environments: {
    server: {
      source: {
        entry: {
          index: {
            import: './src/framework/entry.rsc.tsx',
            layer: Layers.rsc,
          },
        },
      },
    },
    client: {
      source: {
        entry: {
          index: './src/framework/entry.client.tsx',
        },
      },
    },
  },
  server: {
    setup: ({ action, server }) => {
      if (action !== 'dev') {
        return;
      }

      server.middlewares.use(async (req, res, next) => {
        const indexModule = await server.environments.server.loadBundle<{
          default: NodeHandler;
        }>('index');
        await indexModule.default.nodeHandler(req, res, next);
      });
    },
  },
});
