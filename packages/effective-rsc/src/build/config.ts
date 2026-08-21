import {
  type RequestHandler,
  type RsbuildConfig,
  type RsbuildDevServer,
  type RsbuildPlugin,
} from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';
import { Layers, pluginRSC } from 'rsbuild-plugin-rsc';

import { DefaultApplicationPort } from '../server/server-config';

export type RsbuildEntries = {
  readonly application: string;
  readonly client: string;
  readonly rsc: string;
  readonly ssr: string;
  readonly stylesheet: string;
};

export type LoadServerBundle = () => Promise<unknown>;

type DevServerCompile = (loadServerBundle: LoadServerBundle) => Promise<void>;

const FrameworkAssetPrefix = '/assets/';
const ApplicationEntrySpecifier = 'effective-rsc/application-entry';
const ApplicationStylesheetSpecifier = 'effective-rsc/application-stylesheet';

const makeRscPlugin = (entries: RsbuildEntries) =>
  pluginRSC({
    layers: {
      ssr: entries.ssr,
    },
  });

const makeEnvironments = (
  root: string,
  entries: RsbuildEntries,
): NonNullable<RsbuildConfig['environments']> => ({
  client: {
    source: {
      entry: {
        main: {
          import: entries.client,
          html: false,
        },
      },
    },
    output: {
      target: 'web',
      distPath: {
        root: `${root}/.ersc/client`,
        css: '',
        js: '',
        jsAsync: '',
      },
      filename: {
        css: '[name].css',
        js: '[name].js',
      },
      assetPrefix: FrameworkAssetPrefix,
      cleanDistPath: true,
    },
  },
  server: {
    resolve: {
      alias: {
        [ApplicationEntrySpecifier]: entries.application,
        [ApplicationStylesheetSpecifier]: entries.stylesheet,
      },
    },
    source: {
      entry: {
        main: {
          import: entries.rsc,
          layer: Layers.rsc,
          html: false,
        },
      },
    },
    output: {
      target: 'node',
      distPath: {
        root: `${root}/.ersc/server`,
        css: '',
        js: '',
        jsAsync: '',
      },
      filename: {
        css: '[name].css',
        js: '[name].js',
      },
      module: true,
      cleanDistPath: true,
    },
  },
});

export const makeBuildConfig = (root: string, entries: RsbuildEntries): RsbuildConfig => ({
  mode: 'production',
  root,
  server: {
    publicDir: false,
  },
  plugins: [pluginReact(), pluginTailwindcss(), makeRscPlugin(entries)],
  environments: makeEnvironments(root, entries),
});

const makeDevLifecyclePlugin = (
  applicationMiddleware: RequestHandler,
  onServerCompile: DevServerCompile,
): RsbuildPlugin => ({
  name: 'effective-rsc:dev-lifecycle',
  setup(api) {
    let devServer: RsbuildDevServer | null = null;

    api.onBeforeStartDevServer(({ server }) => {
      devServer = server;
      return () => {
        server.middlewares.use(applicationMiddleware);
      };
    });
    api.onCloseDevServer(() => {
      devServer = null;
    });
    api.onAfterEnvironmentCompile(({ environment, stats }) => {
      if (environment.name !== 'server' || !stats || stats.hasErrors() || devServer === null) {
        return;
      }

      const serverEnvironment = devServer.environments['server'];
      if (!serverEnvironment) {
        throw new Error('Rsbuild did not create the effective-rsc server environment.');
      }

      return onServerCompile(() => serverEnvironment.loadBundle('main'));
    });
  },
});

export const makeDevConfig = (
  root: string,
  entries: RsbuildEntries,
  applicationMiddleware: RequestHandler,
  onServerCompile: DevServerCompile,
): RsbuildConfig => {
  return {
    mode: 'development',
    root,
    dev: {
      assetPrefix: FrameworkAssetPrefix,
      hmr: true,
      liveReload: true,
    },
    server: {
      host: 'localhost',
      port: DefaultApplicationPort,
      printUrls: true,
      publicDir: false,
      strictPort: true,
    },
    plugins: [
      pluginReact(),
      pluginTailwindcss(),
      makeRscPlugin(entries),
      makeDevLifecyclePlugin(applicationMiddleware, onServerCompile),
    ],
    environments: makeEnvironments(root, entries),
  };
};
