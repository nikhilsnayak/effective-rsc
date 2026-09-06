import * as BunServices from '@effect/platform-bun/BunServices';
import { expect, it } from '@effect/vitest';
import { Effect, Exit, FileSystem, Logger, Path, Schema } from 'effect';

import { runDeploymentBuild } from '../../src/build/deployment';

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspace = yield* fs.makeTempDirectoryScoped({ prefix: 'ersc-deployment-' });
  const root = path.join(workspace, 'apps/with spaces');
  const write = Effect.fnUntraced(function* (file: string, contents: string) {
    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    yield* fs.writeFileString(file, contents);
  });
  const manifest = (value: unknown) => write(path.join(root, 'package.json'), json(value));
  const install = Effect.fnUntraced(function* (
    name: string,
    metadata: Record<string, unknown>,
    source: string,
  ) {
    const directory = path.join(workspace, 'node_modules', name);
    yield* write(
      path.join(directory, 'package.json'),
      json({
        name,
        type: 'module',
        exports: { './build': './build.js' },
        ...metadata,
      }),
    );
    yield* write(path.join(directory, 'build.js'), source);
  });
  const context = {
    root,
    serverDir: path.join(root, '.ersc/server'),
    clientDir: path.join(root, '.ersc/client'),
    publicDir: path.join(root, 'public'),
  };
  return { fs, path, root, write, manifest, install, context };
});

for (const outcome of ['Success', 'Failure'] as const) {
  it.effect(`reports adapter progress without premature success: ${outcome}`, () => {
    const messages: Array<string> = [];
    const logger = Logger.make(({ message }) => {
      messages.push(Bun.stripANSI(String(message)));
    });

    return Effect.gen(function* () {
      const { manifest, install, context } = yield* fixture;
      yield* manifest({});
      yield* install(
        'deploy',
        {},
        `
        import { Effect } from ${json(import.meta.resolve('effect'))};
        export const build = () => Effect.gen(function* () {
          yield* Effect.addFinalizer(() => Effect.logInfo('Hook closed'));
          yield* Effect.logInfo('Hook running');
          ${outcome === 'Failure' ? "yield* Effect.fail(new Error('packaging failed'));" : ''}
        });
        `,
      );
      const exit = yield* runDeploymentBuild('deploy', context).pipe(Effect.exit);
      expect(Exit.isSuccess(exit)).toBe(outcome === 'Success');
      expect(messages.slice(0, 3)).toEqual([
        '● Building deployment with deploy...',
        'Hook running',
        'Hook closed',
      ]);
      expect(messages.slice(3)).toEqual(
        outcome === 'Success'
          ? [expect.stringMatching(/^✓ Deployment built with deploy in \d+(?:\.\d+)? (?:ms|s)\.$/)]
          : [],
      );
    }).pipe(Effect.withLogger(logger), Effect.provide(BunServices.layer), Effect.scoped);
  });
}

it.effect('runs only the selected hoisted adapter without requiring a manifest marker', () =>
  Effect.gen(function* () {
    const { fs, path, root, manifest, install, context } = yield* fixture;
    yield* manifest({
      dependencies: { '@test/deploy': '*', '@ersc/other': '*' },
      devDependencies: { '@test/deploy': '*' },
    });
    yield* install(
      '@ersc/other',
      {},
      'throw new Error("unselected package must not be imported");',
    );
    yield* install(
      '@test/deploy',
      {},
      `
      import { Effect, FileSystem } from ${json(import.meta.resolve('effect'))};
      import * as BunServices from ${json(import.meta.resolve('@effect/platform-bun/BunServices'))};
      export const build = (context) => Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const file = context.root + '/result';
        yield* Effect.addFinalizer(() => fs.writeFileString(context.root + '/released', 'Closed'));
        if (yield* fs.exists(file)) return yield* Effect.fail('called twice');
        yield* fs.writeFileString(file, JSON.stringify(context));
      }).pipe(Effect.provide(BunServices.layer));
    `,
    );
    yield* runDeploymentBuild('@test/deploy', context);
    const result = yield* fs.readFileString(path.join(root, 'result'));
    const decoded = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(result);
    expect(decoded).toEqual(context);
    const released = yield* fs.readFileString(path.join(root, 'released'));
    expect(released).toBe('Closed');
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

it.effect('runs a devDependency hook and releases its scope when it fails', () =>
  Effect.gen(function* () {
    const { fs, path, root, manifest, install, context } = yield* fixture;
    yield* manifest({ devDependencies: { deploy: '*' } });
    yield* install(
      'deploy',
      {},
      `
      import { Effect, FileSystem } from ${json(import.meta.resolve('effect'))};
      import * as BunServices from ${json(import.meta.resolve('@effect/platform-bun/BunServices'))};
      export const build = ({ root }) => Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* Effect.addFinalizer(() => fs.writeFileString(root + '/released', 'Closed'));
        return yield* Effect.fail('packaging failed');
      }).pipe(Effect.provide(BunServices.layer));
    `,
    );
    const error = yield* runDeploymentBuild('deploy', context).pipe(Effect.flip);
    expect(error).toMatchObject({
      _tag: 'DeploymentBuildError',
      message: 'Deployment build deploy failed.',
    });
    const released = yield* fs.readFileString(path.join(root, 'released'));
    expect(released).toBe('Closed');
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

it.effect('releases an interrupted deployment hook', () =>
  Effect.gen(function* () {
    const { fs, path, root, manifest, install, context } = yield* fixture;
    yield* manifest({ devDependencies: { 'a-interrupted': '*' } });
    yield* install(
      'a-interrupted',
      {},
      `
      import { Effect, FileSystem } from ${json(import.meta.resolve('effect'))};
      import * as BunServices from ${json(import.meta.resolve('@effect/platform-bun/BunServices'))};
      export const build = ({ root }) => Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* Effect.addFinalizer(() => fs.writeFileString(root + '/released', 'Closed'));
        return yield* Effect.interrupt;
      }).pipe(Effect.provide(BunServices.layer));
    `,
    );
    const exit = yield* runDeploymentBuild('a-interrupted', context).pipe(Effect.exit);
    expect(Exit.hasInterrupts(exit)).toBe(true);
    const released = yield* fs.readFileString(path.join(root, 'released'));
    expect(released).toBe('Closed');
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

for (const source of [
  'export const build = 123;',
  'export function build() { throw new Error("broken hook"); }',
  'export function build() { return undefined; }',
  'throw new Error("broken import");',
]) {
  it.effect(`reports an invalid deployment hook as a typed failure: ${source}`, () =>
    Effect.gen(function* () {
      const { manifest, install, context } = yield* fixture;
      yield* manifest({ devDependencies: { broken: '*' } });
      yield* install('broken', {}, source);
      const error = yield* runDeploymentBuild('broken', context).pipe(Effect.flip);
      expect(error).toMatchObject({
        _tag: 'DeploymentBuildError',
        message: 'Deployment build broken failed.',
      });
    }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
  );
}

it.effect('reports a missing adapter package or build export as a typed failure', () =>
  Effect.gen(function* () {
    const { manifest, install, context } = yield* fixture;
    yield* manifest({ devDependencies: { missing: '*' } });
    yield* install('missing', { exports: {} }, '');
    const uninstalled = yield* runDeploymentBuild('uninstalled', context).pipe(Effect.flip);
    expect(uninstalled).toMatchObject({
      _tag: 'DeploymentBuildError',
      message: 'Deployment build uninstalled failed.',
    });
    const missing = yield* runDeploymentBuild('missing', context).pipe(Effect.flip);
    expect(missing).toMatchObject({
      _tag: 'DeploymentBuildError',
      message: 'Deployment build missing failed.',
    });
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);
