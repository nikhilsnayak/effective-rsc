import * as BunServices from '@effect/platform-bun/BunServices';
import { expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path, Schema, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import { BuildServerBundlePath } from '../../src/build/contract';
import { serve } from '../../src/server/serve';

const quote = Schema.encodeSync(Schema.fromJsonString(Schema.String));

it.effect('returns when initialized and retains application resources until its scope closes', () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: 'ersc-start-scope-' });
    const marker = path.join(root, 'lifetime');
    const bundlePath = path.join(root, BuildServerBundlePath);
    yield* fileSystem.makeDirectory(path.dirname(bundlePath), { recursive: true });
    yield* fileSystem.writeFileString(
      bundlePath,
      `
      import { Effect, Layer } from ${quote(import.meta.resolve('effect'))};
      import { writeFileSync } from 'node:fs';
      export default { entryJsFiles: ['main.js'], entryCssFiles: [] };
      export const HttpLayer = Layer.empty;
      export const ServerLayer = Layer.effectDiscard(Effect.acquireRelease(
        Effect.sync(() => writeFileSync(${quote(marker)}, 'Open')),
        () => Effect.sync(() => writeFileSync(${quote(marker)}, 'Closed'))
      ));
    `,
    );
    yield* Effect.gen(function* () {
      yield* serve({ hostname: 'localhost', port: 0, root });
      const state = yield* fileSystem.readFileString(marker);
      expect(state).toBe('Open');
    }).pipe(Effect.scoped);
    const state = yield* fileSystem.readFileString(marker);
    expect(state).toBe('Closed');
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

it.effect('reports a missing production bundle as a typed startup failure', () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: 'ersc-start-missing-' });

    const error = yield* serve({ hostname: 'localhost', port: 0, root }).pipe(Effect.flip);

    expect(error).toMatchObject({
      _tag: 'CompiledServerError',
      message: expect.stringContaining('Failed to load the server bundle'),
    });
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

it.effect('rejects an invalid compiled bundle before starting the server', () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: 'ersc-start-invalid-' });
    const bundlePath = path.join(root, BuildServerBundlePath);
    yield* fileSystem.makeDirectory(path.dirname(bundlePath), { recursive: true });
    yield* fileSystem.writeFileString(bundlePath, 'export default {};');

    const error = yield* serve({ hostname: 'localhost', port: 0, root }).pipe(Effect.flip);

    expect(error).toMatchObject({
      _tag: 'CompiledServerError',
      message: expect.stringContaining('invalid framework contract'),
    });
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

it.effect('public start resolves after readiness and releases resources on SIGTERM', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: 'ersc-public-start-' });
    const marker = path.join(root, 'lifetime');
    const bundlePath = path.join(root, BuildServerBundlePath);
    yield* fs.makeDirectory(path.dirname(bundlePath), { recursive: true });
    yield* fs.writeFileString(
      bundlePath,
      `
import { Effect, Layer } from ${quote(import.meta.resolve('effect'))};
import { writeFileSync } from 'node:fs';
export default { entryJsFiles: ['main.js'], entryCssFiles: [] };
export const HttpLayer = Layer.empty;
export const ServerLayer = Layer.effectDiscard(Effect.acquireRelease(
  Effect.sync(() => {
    const server = Bun.serve({ port: 0, fetch: () => new Response('ready') });
    writeFileSync(${quote(marker)}, 'Open');
    return server;
  }),
  (server) => Effect.sync(() => {
    server.stop(true);
    writeFileSync(${quote(marker)}, 'Closed');
  })
));
`,
    );
    const entry = path.join(root, 'start.mjs');
    yield* fs.writeFileString(
      entry,
      `
import { start } from ${quote(import.meta.resolve('effective-rsc/server'))};
await start({ root: ${quote(root)}, hostname: 'localhost', port: 0 });
console.log('READY ' + await Bun.file(${quote(marker)}).text());
`,
    );
    const child = yield* spawner.spawn(ChildProcess.make('bun', [entry]));
    const lines = yield* child.stdout.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.take(1),
      Stream.runCollect,
    );
    expect(lines).toEqual(['READY Open']);
    const running = yield* child.isRunning;
    expect(running).toBe(true);
    yield* child.kill();
    yield* child.exitCode;
    const state = yield* fs.readFileString(marker);
    expect(state).toBe('Closed');
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

it.effect('public start rejects and exits unsuccessfully when startup fails', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: 'ersc-public-start-failure-' });
    const entry = path.join(root, 'start.mjs');
    yield* fs.writeFileString(
      entry,
      `
import { start } from ${quote(import.meta.resolve('effective-rsc/server'))};
try {
  await start({ root: ${quote(root)}, hostname: 'localhost', port: 0 });
  console.log('UNEXPECTED READY');
} catch {
  console.log('REJECTED');
}
`,
    );
    const child = yield* spawner.spawn(ChildProcess.make('bun', [entry]));
    const output = yield* child.stdout.pipe(Stream.decodeText(), Stream.runCollect);
    const exitCode = yield* child.exitCode;
    expect(output.join('')).toContain('REJECTED');
    expect(output.join('')).not.toContain('UNEXPECTED READY');
    expect(exitCode).not.toBe(0);
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);
