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
