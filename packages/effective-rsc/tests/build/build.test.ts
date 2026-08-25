import { expect, it } from '@effect/vitest';
import type { Configuration } from '@rspack/core';
import rspack from '@rspack/core';
import { Effect, Path } from 'effect';

import { resolveApplicationBuild } from '../../src/build/build';
import { ServerBundlePath } from '../../src/build/output';
import { makeRspackBuildConfig } from '../../src/build/rspack-config';

const BuildModuleUrl = new URL('file:///framework/dist/build/build.js');

const resolveFixtureBuild = (root: string) =>
  resolveApplicationBuild({ buildModuleUrl: BuildModuleUrl, root });

const configNamed = (configs: ReadonlyArray<Configuration>, name: string) => {
  const config = configs.find((candidate) => candidate.name === name);

  expect(config, `expected the ${name} Rspack configuration`).toBeDefined();

  return config as Configuration;
};

const tailwindUseNamed = (config: Configuration) => {
  for (const rule of config.module?.rules ?? []) {
    if (typeof rule !== 'object' || rule === null || !Array.isArray(rule.use)) {
      continue;
    }

    const tailwindUse = rule.use.find(
      (use) =>
        typeof use === 'object' &&
        use !== null &&
        typeof use.loader === 'string' &&
        use.loader.includes('@tailwindcss/webpack'),
    );

    if (tailwindUse !== undefined) {
      return tailwindUse as {
        readonly loader: string;
        readonly options?: unknown;
      };
    }
  }

  return undefined;
};

it.effect('uses real framework entries and private aliases for application source', () =>
  Effect.gen(function* () {
    const { applicationRoot, entries } = yield* resolveFixtureBuild('/workspace');
    const configs = makeRspackBuildConfig(applicationRoot, entries);
    const client = configNamed(configs, 'client');
    const server = configNamed(configs, 'server');

    expect(entries.application).toBe('/workspace/src/application.tsx');
    expect(entries.stylesheet).toBe('/workspace/src/styles.css');
    expect(entries.client).toBe('/framework/dist/client/entry.js');
    expect(entries.rsc).toBe('/framework/dist/build/rsc-entry.js');
    expect(entries.ssr).toBe('/framework/dist/server/ssr.js');
    expect(entries.rsc).not.toContain('/.ersc/');
    expect(server.entry).toEqual({ main: entries.rsc });
    expect(client.target).toBe('browserslist:chrome >= 141, edge >= 141, firefox >= 147');
    expect(server.target).toBe('node26');
    expect(server.module?.rules).toContainEqual(
      expect.objectContaining({
        layer: rspack.experiments.rsc.Layers.rsc,
        resolve: { conditionNames: ['react-server', '...'] },
        resource: entries.rsc,
      }),
    );
    expect(server.resolve?.alias).toEqual({
      'effective-rsc/application-entry': entries.application,
      'effective-rsc/application-stylesheet': entries.stylesheet,
    });
    expect(client.resolve?.alias).toBeUndefined();
    expect(client.output?.path).toBe('/workspace/.ersc/client');
    expect(server.output?.path).toBe('/workspace/.ersc/server');
  }).pipe(Effect.provide(Path.layer)),
);

it.effect('resolves the server bundle where Rspack emits it', () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const { applicationRoot, entries } = yield* resolveFixtureBuild('/workspace');
    const server = configNamed(makeRspackBuildConfig(applicationRoot, entries), 'server');
    const serverEntries = server.entry as Record<string, unknown>;
    const serverEntryName = Object.keys(serverEntries)[0];
    const jsFilenameTemplate = server.output?.filename;

    expect(serverEntryName).toBeDefined();
    expect(typeof jsFilenameTemplate).toBe('string');
    expect(typeof server.output?.path).toBe('string');

    const emittedBundlePath = `${String(server.output?.path)}/${String(jsFilenameTemplate).replace(
      '[name]',
      String(serverEntryName),
    )}`;

    expect(emittedBundlePath).toBe('/workspace/.ersc/server/main.js');
    expect(path.resolve('/workspace', ServerBundlePath)).toBe('/workspace/.ersc/server/main.js');
  }).pipe(Effect.provide(Path.layer)),
);

it.effect('compiles Tailwind CSS against the application root in both runtime graphs', () =>
  Effect.gen(function* () {
    const { applicationRoot, entries } = yield* resolveFixtureBuild('/workspace');
    const configs = makeRspackBuildConfig(applicationRoot, entries);

    for (const name of ['client', 'server']) {
      const tailwindUse = tailwindUseNamed(configNamed(configs, name));

      expect(tailwindUse).toBeDefined();
      expect(tailwindUse?.options).toEqual({
        base: '/workspace',
        optimize: { minify: true },
      });
    }
  }).pipe(Effect.provide(Path.layer)),
);

const reactCompilerOption = (config: Configuration) => {
  const rules = config.module?.rules as
    | ReadonlyArray<{
        readonly use?: ReadonlyArray<{
          readonly loader?: string;
          readonly options?: {
            readonly jsc?: { readonly transform?: { readonly reactCompiler?: unknown } };
          };
        }>;
      }>
    | undefined;

  for (const rule of rules ?? []) {
    for (const use of rule.use ?? []) {
      if (use.loader === 'builtin:swc-loader') {
        return use.options?.jsc?.transform?.reactCompiler;
      }
    }
  }

  return undefined;
};

it.effect('keeps the React Compiler out of the server compilation', () =>
  Effect.gen(function* () {
    const { applicationRoot, entries } = yield* resolveFixtureBuild('/workspace');
    const configs = makeRspackBuildConfig(applicationRoot, entries);

    expect(reactCompilerOption(configNamed(configs, 'client'))).toBe(true);
    expect(reactCompilerOption(configNamed(configs, 'server'))).toBeUndefined();
  }).pipe(Effect.provide(Path.layer)),
);
