import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { defineConfig, type RsbuildPlugin } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { Layers, pluginRSC } from 'rsbuild-plugin-rsc';
import type NodeHandler from './src/framework/entry.rsc';

const execFileAsync = promisify(execFile);

const pluginStaticGenerate = (): RsbuildPlugin => ({
  name: 'static-generate',
  setup(api) {
    api.onAfterBuild(async () => {
      const scriptPath = path.join(import.meta.dirname, 'generate.mjs');
      const { stdout, stderr } = await execFileAsync('node', [scriptPath]);
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);
    });
  },
});

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginRSC({
      layers: {
        ssr: path.join(import.meta.dirname, './src/framework/entry.ssr.tsx'),
      },
    }),
    pluginStaticGenerate(),
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
      output: {
        distPath: {
          root: 'dist/server',
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
    setup: ({ server, action }) => {
      if (action === 'dev') {
        // Custom middleware to handle RSC (React Server Components) requests
        server.middlewares.use(async (req, res, next) => {
          const indexModule = await server.environments.server.loadBundle<{
            default: NodeHandler;
          }>('index');
          await indexModule.default.nodeHandler(req, res, next);
        });
      }
    },
  },
});
