import {
  type RequestHandler,
  type RsbuildConfig,
  type RsbuildDevServer,
  type RsbuildPlugin,
} from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';
import { Layers, pluginRSC } from 'rsbuild-plugin-rsc';

import { FrameworkAssetPrefix } from '../application/route-path';
import { DefaultApplicationPort } from '../server/server-config';
import {
  ClientEntryName,
  ClientOutputDir,
  CssFilenameTemplate,
  JsFilenameTemplate,
  ServerEntryName,
  ServerOutputDir,
} from './output';

export type RsbuildEntries = {
  readonly application: string;
  readonly client: string;
  readonly rsc: string;
  readonly ssr: string;
  readonly stylesheet: string;
};

export type LoadServerBundle = () => Promise<unknown>;

type DevServerCompile = (loadServerBundle: LoadServerBundle) => Promise<void>;

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
    plugins: [pluginReact({ reactCompiler: true })],
    source: {
      entry: {
        [ClientEntryName]: {
          import: entries.client,
          html: false,
        },
      },
    },
    output: {
      target: 'web',
      distPath: {
        root: `${root}/${ClientOutputDir}`,
        css: '',
        js: '',
        jsAsync: '',
      },
      filename: {
        css: CssFilenameTemplate,
        js: JsFilenameTemplate,
      },
      assetPrefix: FrameworkAssetPrefix,
      cleanDistPath: true,
    },
  },
  server: {
    plugins: [pluginReact()],
    resolve: {
      alias: {
        [ApplicationEntrySpecifier]: entries.application,
        [ApplicationStylesheetSpecifier]: entries.stylesheet,
      },
    },
    source: {
      entry: {
        [ServerEntryName]: {
          import: entries.rsc,
          layer: Layers.rsc,
          html: false,
        },
      },
    },
    output: {
      target: 'node',
      distPath: {
        root: `${root}/${ServerOutputDir}`,
        css: '',
        js: '',
        jsAsync: '',
      },
      filename: {
        css: CssFilenameTemplate,
        js: JsFilenameTemplate,
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
  plugins: [pluginTailwindcss(), makeRscPlugin(entries)],
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

      return onServerCompile(() => serverEnvironment.loadBundle(ServerEntryName));
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
      pluginTailwindcss(),
      makeRscPlugin(entries),
      makeDevLifecyclePlugin(applicationMiddleware, onServerCompile),
    ],
    environments: makeEnvironments(root, entries),
  };
};
