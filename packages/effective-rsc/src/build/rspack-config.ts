import { createRequire } from 'node:module';

import rspack, { type Configuration, type RuleSetRule } from '@rspack/core';
import { ReactRefreshRspackPlugin } from '@rspack/plugin-react-refresh';

import { FrameworkAssetPrefix } from '../application/route-path';
import {
  ApplicationEntrySpecifier,
  BuildClientOutputDir,
  BuildCssFilenameTemplate,
  BuildJsFilenameTemplate,
  BuildServerOutputDir,
  ClientEntryName,
  DevClientOutputDir,
  DevCssFilenameTemplate,
  DevJsFilenameTemplate,
  DevServerOutputDir,
  ServerEntryName,
} from './contract';

export type RspackEntries = {
  readonly application: string;
  readonly client: string;
  readonly rsc: string;
  readonly ssr: string;
};

export type RspackDevConfigOptions = {
  readonly onServerComponentChanges?: () => void | Promise<void>;
};

const require = createRequire(import.meta.url);
const TailwindLoaderPath = require.resolve('@tailwindcss/webpack');

const SupportedBrowserTargets = ['chrome >= 141', 'edge >= 141', 'firefox >= 147'] as const;

const BunModulePrefix = 'bun:';
const EffectModuleName = 'effect';
const EffectModulePrefix = `${EffectModuleName}/`;
const EffectPackagePrefix = '@effect/';

export type ExternalsRequest = {
  readonly request?: string;
};

const isBunModule = (request: string | undefined): request is string =>
  request !== undefined && request.startsWith(BunModulePrefix);

const isEffectModule = (request: string | undefined): request is string =>
  request === EffectModuleName ||
  request?.startsWith(EffectModulePrefix) === true ||
  request?.startsWith(EffectPackagePrefix) === true;

export const externalizeServerModule = ({ request }: ExternalsRequest): string | false =>
  isBunModule(request) || isEffectModule(request) ? `module ${request}` : false;

export const rejectBunModule = ({ request }: ExternalsRequest): false => {
  if (isBunModule(request)) {
    throw new Error(
      `"${request}" is a Bun built-in and cannot enter the browser module graph. Move the import behind a Server Component, Layout, Page, or ServerFn boundary so it stays in the server graph.`,
    );
  }

  return false;
};

type CompilationMode = 'development' | 'production';

const makeSwcRule = (target: 'browser' | 'server', mode: CompilationMode): RuleSetRule => ({
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
              development: mode === 'development',
              refresh: target === 'browser' && mode === 'development',
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

const makeCssRule = (root: string, mode: CompilationMode): RuleSetRule => ({
  test: /\.css$/i,
  type: 'css/auto',
  use: [
    {
      loader: TailwindLoaderPath,
      options: {
        base: root,
        optimize: mode === 'production' ? { minify: true } : false,
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

const makeRspackConfig = (
  root: string,
  entries: RspackEntries,
  mode: CompilationMode,
  devOptions?: RspackDevConfigOptions,
): ReadonlyArray<Configuration> => {
  const { ClientPlugin, ServerPlugin } = rspack.experiments.rsc.createPlugins();
  const { Layers } = rspack.experiments.rsc;
  const development = mode === 'development';
  const clientOutputDir = development ? DevClientOutputDir : BuildClientOutputDir;
  const serverOutputDir = development ? DevServerOutputDir : BuildServerOutputDir;
  const cssFilename = development ? DevCssFilenameTemplate : BuildCssFilenameTemplate;
  const jsFilename = development ? DevJsFilenameTemplate : BuildJsFilenameTemplate;

  const client: Configuration = {
    context: root,
    devtool: development ? 'cheap-module-source-map' : false,
    entry: {
      [ClientEntryName]: entries.client,
    },
    externals: [rejectBunModule],
    mode,
    module: {
      rules: [makeCssRule(root, mode), makeSwcRule('browser', mode)],
    },
    name: 'client',
    optimization: {
      emitOnErrors: !development,
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
      chunkFilename: jsFilename,
      clean: !development,
      cssChunkFilename: cssFilename,
      cssFilename,
      filename: jsFilename,
      path: `${root}/${clientOutputDir}`,
      publicPath: FrameworkAssetPrefix,
    },
    plugins: [
      new ClientPlugin(),
      ...(development
        ? [new rspack.HotModuleReplacementPlugin(), new ReactRefreshRspackPlugin()]
        : []),
    ],
    resolve: makeResolve(root),
    target: `browserslist:${SupportedBrowserTargets.join(', ')}`,
  };

  const server: Configuration = {
    context: root,
    devtool: 'source-map',
    entry: {
      [ServerEntryName]: entries.rsc,
    },
    externals: [externalizeServerModule],
    mode,
    module: {
      rules: [
        makeCssRule(root, mode),
        makeSwcRule('server', mode),
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
      emitOnErrors: !development,
      minimize: false,
      splitChunks: {
        chunks: 'all',
      },
    },
    output: {
      chunkFilename: jsFilename,
      chunkFormat: 'module',
      chunkLoading: 'import',
      clean: !development,
      cssChunkFilename: cssFilename,
      cssFilename,
      filename: jsFilename,
      library: {
        type: 'module',
      },
      module: true,
      path: `${root}/${serverOutputDir}`,
      publicPath: '/',
    },
    plugins: [
      devOptions?.onServerComponentChanges === undefined
        ? new ServerPlugin()
        : new ServerPlugin({
            onServerComponentChanges: devOptions.onServerComponentChanges,
          }),
    ],
    resolve: {
      ...makeResolve(root),
      alias: {
        [ApplicationEntrySpecifier]: entries.application,
      },
    },
    target: 'node26',
  };

  return [client, server];
};

export const makeRspackBuildConfig = (root: string, entries: RspackEntries) =>
  makeRspackConfig(root, entries, 'production');

export const makeRspackDevConfig = (
  root: string,
  entries: RspackEntries,
  options?: RspackDevConfigOptions,
) => makeRspackConfig(root, entries, 'development', options);
