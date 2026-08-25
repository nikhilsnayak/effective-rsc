import { createRequire } from 'node:module';

import rspack, { type Configuration, type RuleSetRule } from '@rspack/core';

import { FrameworkAssetPrefix } from '../application/route-path';
import {
  ClientEntryName,
  ClientOutputDir,
  CssFilenameTemplate,
  JsFilenameTemplate,
  ServerEntryName,
  ServerOutputDir,
} from './output';

export type RspackEntries = {
  readonly application: string;
  readonly client: string;
  readonly rsc: string;
  readonly ssr: string;
  readonly stylesheet: string;
};

const ApplicationEntrySpecifier = 'effective-rsc/application-entry';
const ApplicationStylesheetSpecifier = 'effective-rsc/application-stylesheet';
const require = createRequire(import.meta.url);
const TailwindLoaderPath = require.resolve('@tailwindcss/webpack');

const SupportedBrowserTargets = ['chrome >= 141', 'edge >= 141', 'firefox >= 147'] as const;

const makeSwcRule = (target: 'browser' | 'server'): RuleSetRule => ({
  test: /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$/,
  type: 'javascript/auto',
  use: [
    {
      loader: 'builtin:swc-loader',
      options: {
        detectSyntax: 'auto',
        isModule: 'unknown',
        jsc: {
          experimental: {
            keepImportAttributes: true,
          },
          parser: {
            decorators: true,
          },
          transform: {
            react: {
              development: false,
              runtime: 'automatic',
            },
            ...(target === 'browser' ? { reactCompiler: true } : {}),
          },
        },
        rspackExperiments: {
          reactServerComponents: true,
        },
      },
    },
  ],
});

const makeCssRule = (root: string): RuleSetRule => ({
  test: /\.css$/i,
  type: 'css/auto',
  use: [
    {
      loader: TailwindLoaderPath,
      options: {
        base: root,
        optimize: { minify: true },
      },
    },
  ],
});

const makeResolve = (root: string): NonNullable<Configuration['resolve']> => ({
  extensionAlias: {
    '.js': ['.js', '.ts', '.tsx'],
    '.jsx': ['.jsx', '.tsx'],
  },
  extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  tsConfig: {
    configFile: `${root}/tsconfig.json`,
    references: 'auto',
  },
});

export const makeRspackBuildConfig = (
  root: string,
  entries: RspackEntries,
): ReadonlyArray<Configuration> => {
  const { ClientPlugin, ServerPlugin } = rspack.experiments.rsc.createPlugins();
  const { Layers } = rspack.experiments.rsc;

  const client: Configuration = {
    context: root,
    devtool: false,
    entry: {
      [ClientEntryName]: entries.client,
    },
    mode: 'production',
    module: {
      rules: [makeCssRule(root), makeSwcRule('browser')],
    },
    name: 'client',
    optimization: {
      splitChunks: {
        cacheGroups: {
          react: {
            name: 'lib-react',
            priority: 0,
            test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
          },
        },
        chunks: 'all',
      },
    },
    output: {
      chunkFilename: JsFilenameTemplate,
      clean: true,
      cssChunkFilename: CssFilenameTemplate,
      cssFilename: CssFilenameTemplate,
      filename: JsFilenameTemplate,
      path: `${root}/${ClientOutputDir}`,
      publicPath: FrameworkAssetPrefix,
    },
    plugins: [new ClientPlugin()],
    resolve: makeResolve(root),
    target: `browserslist:${SupportedBrowserTargets.join(', ')}`,
  };

  const server: Configuration = {
    context: root,
    devtool: false,
    entry: {
      [ServerEntryName]: entries.rsc,
    },
    mode: 'production',
    module: {
      rules: [
        makeCssRule(root),
        makeSwcRule('server'),
        {
          resource: entries.rsc,
          layer: Layers.rsc,
          resolve: {
            conditionNames: ['react-server', '...'],
          },
        },
        {
          resource: entries.ssr,
          layer: Layers.ssr,
        },
        {
          exclude: entries.ssr,
          issuerLayer: Layers.rsc,
          resolve: {
            conditionNames: ['react-server', '...'],
          },
        },
      ],
    },
    name: 'server',
    optimization: {
      minimize: false,
      splitChunks: {
        chunks: 'all',
      },
    },
    output: {
      chunkFilename: JsFilenameTemplate,
      chunkFormat: 'module',
      chunkLoading: 'import',
      clean: true,
      cssChunkFilename: CssFilenameTemplate,
      cssFilename: CssFilenameTemplate,
      filename: JsFilenameTemplate,
      library: {
        type: 'module',
      },
      module: true,
      path: `${root}/${ServerOutputDir}`,
      publicPath: '/',
    },
    plugins: [new ServerPlugin()],
    resolve: {
      ...makeResolve(root),
      alias: {
        [ApplicationEntrySpecifier]: entries.application,
        [ApplicationStylesheetSpecifier]: entries.stylesheet,
      },
    },
    target: 'node26',
  };

  return [client, server];
};
