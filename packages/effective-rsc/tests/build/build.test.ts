import { expect, it } from '@effect/vitest';
import { Effect, Path } from 'effect';
import { Layers } from 'rsbuild-plugin-rsc';

import { resolveApplicationBuild } from '../../src/build/build';
import { makeBuildConfig } from '../../src/build/config';

it.effect('uses real framework entries and private aliases for application source', () =>
  Effect.gen(function* () {
    const { applicationRoot, entries } = yield* resolveApplicationBuild({ root: '/workspace' });
    const config = makeBuildConfig(applicationRoot, entries);
    const clientEnvironment = config.environments?.['client'];
    const serverEnvironment = config.environments?.['server'];

    expect(entries.application).toBe('/workspace/src/application.tsx');
    expect(entries.stylesheet).toBe('/workspace/src/styles.css');
    expect(entries.rsc.endsWith('/src/build/rsc-entry.ts')).toBe(true);
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
  }).pipe(Effect.provide(Path.layer)),
);
