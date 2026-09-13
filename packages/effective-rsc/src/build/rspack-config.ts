import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import rspack, {
  type Compiler,
  type Configuration,
  type RuleSetRule,
  type RuleSetUseItem,
} from '@rspack/core';
import { ReactRefreshRspackPlugin } from '@rspack/plugin-react-refresh';

import PackageJson from '../../package.json' with { type: 'json' };
import { FrameworkAssetPrefix } from '../application/route-path';
import {
  ApplicationEntrySpecifier,
  ClientEntryName,
  type Environment,
  EnvironmentConfig,
  ServerEntryName,
} from './contract';

export type RspackEntries = {
  readonly application: string;
  readonly client: string;
  readonly rsc: string;
  readonly ssr: string;
};

export type RspackDevConfigOptions = {
  readonly onCompilationStart?: () => void;
  readonly onServerComponentChanges?: () => void | Promise<void>;
};

const require = createRequire(import.meta.url);
const TailwindLoaderPath = require.resolve('@tailwindcss/webpack');
const IgnoreCssLoaderPath = require.resolve('./ignore-css-loader.js');
const CacheDirectory = 'node_modules/.cache/ersc/rspack';
const ConfigModulePath = fileURLToPath(import.meta.url);

const SupportedBrowserTargets = ['chrome >= 141', 'edge >= 141', 'firefox >= 147'] as const;

// Lowercase only, because `effective-rsc/types` declares these modules and TypeScript matches a
// wildcard module pattern case-sensitively. An uppercase extension would otherwise compile and then
// fail to resolve its type.
const ImagePattern =
  /\.(?:apng|avif|bmp|cur|gif|ico|jfif|jpe?g|jxl|pjp(?:eg)?|png|svg|tiff?|webp)$/;
const FontPattern = /\.(?:eot|otf|ttc|ttf|woff2?)$/;
const MediaPattern = /\.(?:aac|flac|m4a|mov|mp3|mp4|ogg|opus|vtt|wav|webm)$/;

const BunModulePrefix = 'bun:';
const ServerExternalPackages: ReadonlyArray<string> = ['effect'];

export type ExternalsRequest = {
  readonly request?: string;
};

const isBunModule = (request: string | undefined): request is string =>
  request !== undefined && request.startsWith(BunModulePrefix);

const isServerExternalPackage = (request: string | undefined): request is string =>
  request !== undefined &&
  ServerExternalPackages.some((name) => request === name || request.startsWith(`${name}/`));

export const externalizeServerModule = ({ request }: ExternalsRequest): string | false =>
  isBunModule(request) || isServerExternalPackage(request) ? `module ${request}` : false;

const NodeModulesPattern = /[\\/]node_modules[\\/]/;
const SourcePattern = /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$/;

const isApplicationSource = (
  sourceRoot: string,
  resource: string | undefined,
): resource is string =>
  resource !== undefined &&
  resource.replaceAll('\\', '/').startsWith(sourceRoot) &&
  !NodeModulesPattern.test(resource);

const makeSwcLoader = (
  target: 'browser' | 'server',
  mode: Environment,
  reactCompiler: boolean,
): RuleSetUseItem => ({
  loader: 'builtin:swc-loader',
  options: {
    collectTypeScriptInfo: {
      exportedEnum: mode === 'production',
      typeExports: true,
    },
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
        ...(reactCompiler ? { reactCompiler: true } : {}),
      },
    },
    rspackExperiments: {
      reactServerComponents: true,
    },
  },
});

const makeSwcRule = (
  root: string,
  target: 'browser' | 'server',
  mode: Environment,
): RuleSetRule => {
  const plain = [makeSwcLoader(target, mode, false)];
  if (target === 'server') {
    return { test: SourcePattern, type: 'javascript/auto', use: plain };
  }

  const compiled = [makeSwcLoader(target, mode, true)];
  // Rspack resolves workspace symlinks outside node_modules. Include only this app's source tree.
  const sourceRoot = `${root.replaceAll('\\', '/').replace(/\/$/, '')}/src/`;
  return {
    test: SourcePattern,
    type: 'javascript/auto',
    use: ({ resource }) => (isApplicationSource(sourceRoot, resource) ? compiled : plain),
  };
};

const makeCssRule = (root: string, mode: Environment): RuleSetRule => ({
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

// Only the browser graph writes asset files. The server graph resolves the same URLs so Server
// Components can reference them, which needs the browser's public path rather than its own.
const makeAssetRule = (target: 'browser' | 'server', mode: Environment): RuleSetRule => ({
  generator: {
    filename: EnvironmentConfig[mode].clientAssetFilename,
    ...(target === 'server' ? { emit: false, publicPath: FrameworkAssetPrefix } : {}),
  },
  test: [ImagePattern, FontPattern, MediaPattern],
  type: 'asset/resource',
});

// The server graph keeps CSS modules for ordering, not for their bytes.
const makeIgnoredCssRule = (): RuleSetRule => ({
  test: /\.css$/i,
  type: 'css/auto',
  use: [{ loader: IgnoreCssLoaderPath }],
});

// Development only: a production build starts cold in CI, where writing a cache costs more than it
// saves. Rspack separates caches by compiler name and mode but cannot see these inputs change.
const makeCache = (root: string): NonNullable<Configuration['cache']> => ({
  buildDependencies: [ConfigModulePath, `${root}/package.json`, `${root}/tsconfig.json`],
  storage: {
    directory: `${root}/${CacheDirectory}`,
    type: 'filesystem',
  },
  type: 'persistent',
  version: PackageJson.version,
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

const makeCompilationStartPlugin = (onCompilationStart: () => void) => ({
  apply(compiler: Compiler) {
    compiler.hooks.watchRun.tap('ersc:dev', onCompilationStart);
  },
});

const makeRspackConfig = (
  root: string,
  entries: RspackEntries,
  mode: Environment,
  devOptions?: RspackDevConfigOptions,
): ReadonlyArray<Configuration> => {
  const { ClientPlugin, ServerPlugin } = rspack.experiments.rsc.createPlugins();
  const { Layers } = rspack.experiments.rsc;
  const development = mode === 'development';
  const config = EnvironmentConfig[mode];

  const client: Configuration = {
    cache: development ? makeCache(root) : false,
    context: root,
    devtool: development ? 'cheap-module-source-map' : false,
    entry: {
      [ClientEntryName]: entries.client,
    },
    experiments: {
      // The RSC client plugin sets `watchOptions.ignored` to a function the native watcher rejects.
      nativeWatcher: false,
    },
    infrastructureLogging: {
      level: 'error',
    },
    mode,
    module: {
      parser: {
        javascript: {
          typeReexportsPresence: 'tolerant',
        },
      },
      rules: [
        makeAssetRule('browser', mode),
        makeCssRule(root, mode),
        makeSwcRule(root, 'browser', mode),
      ],
    },
    name: 'client',
    optimization: {
      // Shorter identifiers shrink the runtime chunk.
      chunkIds: development ? 'named' : 'compact-hashed',
      emitOnErrors: !development,
      moduleIds: development ? 'named' : 'compact-hashed',
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
      chunkFilename: config.clientJsFilename,
      clean: !development,
      cssChunkFilename: config.clientCssFilename,
      cssFilename: config.clientCssFilename,
      // The Rspack runtime does not need the browser's temporal dead zone checks.
      environment: {
        const: false,
      },
      filename: config.clientJsFilename,
      path: `${root}/${config.clientOutputDir}`,
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
    cache: development ? makeCache(root) : false,
    context: root,
    devtool: 'source-map',
    entry: {
      [ServerEntryName]: entries.rsc,
    },
    experiments: {
      // The RSC client plugin sets `watchOptions.ignored` to a function the native watcher rejects.
      nativeWatcher: false,
    },
    externals: [externalizeServerModule],
    infrastructureLogging: {
      level: 'error',
    },
    mode,
    module: {
      parser: {
        javascript: {
          typeReexportsPresence: 'tolerant',
        },
      },
      rules: [
        makeAssetRule('server', mode),
        makeIgnoredCssRule(),
        makeSwcRule(root, 'server', mode),
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
      chunkFilename: config.serverJsFilename,
      chunkFormat: 'module',
      chunkLoading: 'import',
      clean: !development,
      filename: config.serverJsFilename,
      library: {
        type: 'module',
      },
      module: true,
      path: `${root}/${config.serverOutputDir}`,
      publicPath: '/',
    },
    plugins: [
      ...(devOptions?.onCompilationStart === undefined
        ? []
        : [makeCompilationStartPlugin(devOptions.onCompilationStart)]),
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
