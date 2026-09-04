import type { RsbuildConfig, RsbuildPlugin } from '@rsbuild/core';
import { rspack } from '@rsbuild/core';
import type { PluginRSCOptions } from './types.js';

export const PLUGIN_RSC_NAME = 'rsbuild:rsc';

const rsc: typeof rspack.experiments.rsc = rspack.experiments.rsc;

export const Layers: typeof rsc.Layers = rsc.Layers;

const SOURCE_MAP_ENDPOINT = '/__rsbuild_source_map';

const findSourceMapURLCode = [
  'import { setFindSourceMapURLCallback } from "react-server-dom-rspack/client.browser";',
  'setFindSourceMapURLCallback(function(fileName, environmentName) {',
  `  return window.location.origin + "${SOURCE_MAP_ENDPOINT}?fileName=" + encodeURIComponent(fileName) + "&environmentName=" + encodeURIComponent(environmentName);`,
  '});',
].join('\n');

const findSourceMapURLCodeDataUri = `data:text/javascript,${encodeURIComponent(findSourceMapURLCode)}`;

/**
 * Plugin to inject findSourceMapURL callback as a global entry
 */
class FindSourceMapURLPlugin {
  apply(compiler: typeof rspack.Compiler.prototype) {
    new rspack.EntryPlugin(compiler.context, findSourceMapURLCodeDataUri, {
      name: undefined,
    }).apply(compiler);
  }
}

export const pluginRSC = (
  pluginOptions: PluginRSCOptions = {},
): RsbuildPlugin => ({
  name: PLUGIN_RSC_NAME,

  setup(api) {
    const { server = 'server', client = 'client' } =
      pluginOptions.environments || {};

    api.modifyRsbuildConfig((config, { mergeRsbuildConfig }) => {
      const rscEnvironmentsConfig: RsbuildConfig = {
        tools: {
          rspack: {
            experiments: {
              // Rspack's RSC ClientPlugin uses a function for
              // `watchOptions.ignored`, which NativeWatcher does not support
              // and causes the development server to crash.
              nativeWatcher: false,
            },
          },
          swc: {
            rspackExperiments: {
              reactServerComponents: true,
            },
          },
        },
        environments: {
          [server]: {
            // RSC directives in dependencies need to go through swc-loader,
            // but core-js should not be recompiled.
            source: {
              include: [
                {
                  not: /[\\/]core-js[\\/]/,
                },
              ],
            },
            output: {
              target: 'node',
            },
          },
          [client]: {
            output: {
              target: 'web',
            },
          },
        },
      };

      const isDev =
        process.env.NODE_ENV === 'development' || config.mode === 'development';

      if (isDev) {
        const devConfig: RsbuildConfig = {
          environments: {
            [server]: {
              output: {
                sourceMap: {
                  js: 'source-map',
                },
              },
            },
          },
          server: {
            setup: ({ server }) => {
              server.middlewares.use(SOURCE_MAP_ENDPOINT, async (req, res) => {
                const url = new URL(
                  req.url!,
                  `http://${req.headers.host || 'localhost'}`,
                );
                const fileName = url.searchParams.get('fileName');
                if (!fileName) {
                  res.statusCode = 400;
                  res.end('Missing fileName parameter');
                  return;
                }

                const envName = url.searchParams.get('environmentName');
                const rscEnvName = envName === 'Client' ? 'client' : 'server';
                const rsbuildEnvName = pluginOptions.environments
                  ? pluginOptions.environments[rscEnvName]
                  : rscEnvName;
                // @ts-expect-error -- Rsbuild injects environments on the dev server instance at runtime.
                const envAPI = server.environments[rsbuildEnvName];

                if (!envAPI) {
                  res.statusCode = 404;
                  res.end('Environment not found');
                  return;
                }

                try {
                  const stats = await envAPI.getStats();
                  const compilation = stats.compilation;

                  // Try to find the source map asset
                  const sourceMapName = fileName.endsWith('.map')
                    ? fileName
                    : `${fileName}.map`;

                  const asset = compilation.getAsset(sourceMapName);
                  if (asset) {
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.end(asset.source.source());
                    return;
                  }

                  // Fallback: try to match by basename
                  const baseName = sourceMapName.split('/').pop();
                  if (baseName) {
                    for (const a of compilation.getAssets()) {
                      if (a.name.endsWith(baseName)) {
                        res.setHeader('Content-Type', 'application/json');
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        res.end(a.source.source());
                        return;
                      }
                    }
                  }

                  res.statusCode = 404;
                  res.end('Source map not found');
                } catch {
                  res.statusCode = 500;
                  res.end('Error reading source map');
                }
              });
            },
          },
        };
        return mergeRsbuildConfig(config, rscEnvironmentsConfig, devConfig);
      }

      return mergeRsbuildConfig(config, rscEnvironmentsConfig);
    });

    let rscPlugins: ReturnType<typeof rsc.createPlugins>;

    let sendServerComponentChanges: (() => void) | undefined;
    api.onBeforeStartDevServer(({ server }) => {
      sendServerComponentChanges = () =>
        server.sockWrite('custom', { event: 'rsc:update' });
    });

    api.modifyBundlerChain(async (chain, { environment, isDev }) => {
      if (!rscPlugins) {
        rscPlugins = rsc.createPlugins();
      }

      if (environment.name === server) {
        const { rsc, ssr } = pluginOptions.layers || {};

        if (ssr) {
          chain.module.rule('ssr-entry').test(ssr).layer(Layers.ssr);
        }
        if (rsc) {
          chain.module.rule('rsc-entry').test(rsc).layer(Layers.rsc);
        }

        let rule = chain.module.rule('rsc-resolve');
        if (ssr) {
          rule = rule.exclude.add(ssr).end();
        }
        rule
          .issuerLayer([Layers.rsc])
          .resolve.conditionNames.add('react-server')
          .add('...');

        chain.plugin('rsc-server').use(rscPlugins.ServerPlugin, [
          {
            onServerComponentChanges() {
              sendServerComponentChanges?.();
            },
          },
        ]);
      }
      if (environment.name === client) {
        chain.plugin('rsc-client').use(rscPlugins.ClientPlugin);

        // In development mode, inject setFindSourceMapURLCallback to enable
        // source map resolution for server component error stacks in the browser.
        if (isDev) {
          chain.plugin('find-source-map-url').use(FindSourceMapURLPlugin);
        }
      }
    });
  },
});
