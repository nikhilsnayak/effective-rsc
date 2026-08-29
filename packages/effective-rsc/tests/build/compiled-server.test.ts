import * as BunServices from '@effect/platform-bun/BunServices';
import { expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';

import { loadServerBundle } from '../../src/build/compiled-server';

const EffectModuleUrl = import.meta.resolve('effect');

const serverBundleSource = (generation: string) => `
  import { Layer } from ${JSON.stringify(EffectModuleUrl)};

  export default {
    entryCssFiles: [${JSON.stringify(`${generation}.css`)}],
    entryJsFiles: [${JSON.stringify(`${generation}.js`)}],
  };
  export const HttpLayer = Layer.empty;
  export const ServerLayer = Layer.empty;
`;

it.effect('loads each content-hashed server bundle as a distinct generation', () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: 'ersc-server-bundle-' });
    const firstPath = path.join(directory, 'main.first.js');
    const secondPath = path.join(directory, 'main.second.js');

    yield* fileSystem.writeFileString(firstPath, serverBundleSource('first'));
    yield* fileSystem.writeFileString(secondPath, serverBundleSource('second'));

    const first = yield* loadServerBundle(firstPath);
    const second = yield* loadServerBundle(secondPath);

    expect(first.default.entryJsFiles).toEqual(['first.js']);
    expect(second.default.entryJsFiles).toEqual(['second.js']);
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);
