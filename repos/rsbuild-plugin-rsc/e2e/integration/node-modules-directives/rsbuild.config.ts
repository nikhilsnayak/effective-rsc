import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { Layers, pluginRSC } from 'rsbuild-plugin-rsc';
import type NodeHandler from './server';

export default defineConfig({
  plugins: [pluginReact(), pluginRSC()],
  environments: {
    server: {
      source: {
        entry: {
          index: {
            import: './server/index.tsx',
            layer: Layers.rsc,
          },
        },
      },
    },
    client: {
      source: {
        entry: {
          index: './client/index.tsx',
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
          default: typeof NodeHandler;
        }>('index');
        await indexModule.default.nodeHandler(req, res, next);
      });
    },
  },
});
