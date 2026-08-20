import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { Layers, pluginRSC } from 'rsbuild-plugin-rsc';
import type ServerModule from './server';

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
        if (!req.headers.accept?.includes('text/x-component')) {
          next();
          return;
        }

        const indexModule = await server.environments.server.loadBundle<{
          default: typeof ServerModule;
        }>('index');
        await indexModule.default.nodeHandler(req, res, next);
      });
    },
  },
});
