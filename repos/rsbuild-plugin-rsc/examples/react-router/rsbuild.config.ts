import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { Layers, pluginRSC } from 'rsbuild-plugin-rsc';
import type NodeHandler from './src/entry.rsc';

const reactRouterInternalClientPath = path.join(
  import.meta.dirname,
  './src/react-router-internal-client.ts',
);

export default defineConfig({
  source: {
    alias: {
      'react-router/internal/react-server-client':
        reactRouterInternalClientPath,
    },
  },
  tools: {
    bundlerChain(chain) {
      chain.resolve.alias.set(
        'react-router/internal/react-server-client',
        reactRouterInternalClientPath,
      );
    },
    rspack(config) {
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        'react-router/internal/react-server-client':
          reactRouterInternalClientPath,
      };
    },
  },
  plugins: [
    pluginReact(),
    pluginRSC({
      layers: {
        ssr: [path.join(import.meta.dirname, './src/entry.ssr.tsx')],
      },
    }),
  ],
  environments: {
    server: {
      source: {
        entry: {
          index: {
            import: './src/entry.rsc.tsx',
            layer: Layers.rsc,
          },
        },
      },
    },
    client: {
      source: {
        entry: {
          index: './src/entry.browser.tsx',
        },
      },
    },
  },
  server: {
    setup: ({ server }) => {
      server.middlewares.use(async (req, res, next) => {
        const indexModule = await server.environments.server.loadBundle<{
          default: NodeHandler;
        }>('index');
        await indexModule.default.nodeHandler(req, res, next);
      });
    },
  },
});
