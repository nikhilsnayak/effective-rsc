import { expect, it } from '@effect/vitest';
import { Effect, Path } from 'effect';
import { Layers } from 'rsbuild-plugin-rsc';

import { resolveApplicationBuild } from '../../src/build/build';
import { makeBuildConfig } from '../../src/build/config';
import { ServerBundlePath } from '../../src/build/output';

it.effect('uses real framework entries and private aliases for application source', () =>
  Effect.gen(function* () {
    const { applicationRoot, entries } = yield* resolveApplicationBuild({ root: '/workspace' });
    const config = makeBuildConfig(applicationRoot, entries);
    const clientEnvironment = config.environments?.['client'];
    const serverEnvironment = config.environments?.['server'];

    expect(entries.application).toBe('/workspace/src/application.tsx');
    expect(entries.stylesheet).toBe('/workspace/src/styles.css');
    expect(entries.rsc.endsWith('/src/build/rsc-entry.ts')).toBe(true);
    expect(entries.rsc).not.toContain('/.ersc/');
    expect(serverEnvironment?.source?.entry).toEqual({
      main: {
        html: false,
        import: entries.rsc,
        layer: Layers.rsc,
      },
    });
    expect(serverEnvironment?.resolve?.alias).toEqual({
      'effective-rsc/application-entry': entries.application,
      'effective-rsc/application-stylesheet': entries.stylesheet,
    });
    expect(clientEnvironment?.resolve).toBeUndefined();
    expect(clientEnvironment?.output?.distPath).toMatchObject({
      root: '/workspace/.ersc/client',
    });
    expect(serverEnvironment?.output?.distPath).toMatchObject({
      root: '/workspace/.ersc/server',
    });
  }).pipe(Effect.provide(Path.layer)),
);

it.effect('resolves the server bundle where the compiler emits it', () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const { applicationRoot, entries } = yield* resolveApplicationBuild({ root: '/workspace' });
    const serverEnvironment = makeBuildConfig(applicationRoot, entries).environments?.['server'];
    const serverEntryName = Object.keys(serverEnvironment?.source?.entry ?? {})[0];
    const jsFilenameTemplate = serverEnvironment?.output?.filename?.js;
    const distPath = serverEnvironment?.output?.distPath;
    const distRoot = typeof distPath === 'string' ? distPath : distPath?.root;

    expect(serverEntryName).toBeDefined();
    expect(typeof jsFilenameTemplate).toBe('string');
    expect(typeof distRoot).toBe('string');

    const emittedBundlePath = `${String(distRoot)}/${String(jsFilenameTemplate).replace(
      '[name]',
      String(serverEntryName),
    )}`;

    expect(emittedBundlePath).toBe('/workspace/.ersc/server/main.js');
    expect(path.resolve('/workspace', ServerBundlePath)).toBe('/workspace/.ersc/server/main.js');
  }).pipe(Effect.provide(Path.layer)),
);

const reactCompilerOptions = (plugins: ReadonlyArray<unknown> | undefined) => {
  const captured: Array<unknown> = [];

  for (const plugin of plugins ?? []) {
    const { setup } = plugin as {
      readonly setup: (api: {
        readonly context: { readonly version: string };
        readonly modifyBundlerChain: (fn: unknown) => void;
        readonly modifyEnvironmentConfig: (
          fn: (
            config: unknown,
            utils: { readonly mergeEnvironmentConfig: (fragment: unknown) => unknown },
          ) => unknown,
        ) => void;
      }) => void;
    };

    setup({
      context: { version: '2.2.0' },
      modifyBundlerChain: () => undefined,
      modifyEnvironmentConfig: (fn) => {
        const fragment = fn(
          { mode: 'production', dev: { hmr: false }, output: { target: 'web' } },
          { mergeEnvironmentConfig: (merged) => merged },
        ) as { tools?: { swc?: { jsc?: { transform?: { reactCompiler?: unknown } } } } };

        captured.push(fragment.tools?.swc?.jsc?.transform?.reactCompiler);
      },
    });
  }

  return captured;
};

it.effect('keeps the React Compiler out of the server environment', () =>
  Effect.gen(function* () {
    const { applicationRoot, entries } = yield* resolveApplicationBuild({ root: '/workspace' });
    const config = makeBuildConfig(applicationRoot, entries);

    expect(reactCompilerOptions(config.environments?.['client']?.plugins)).toEqual([true]);
    expect(reactCompilerOptions(config.environments?.['server']?.plugins)).toEqual([undefined]);
  }).pipe(Effect.provide(Path.layer)),
);
