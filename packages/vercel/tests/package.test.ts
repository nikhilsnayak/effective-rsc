import * as BunServices from '@effect/platform-bun/BunServices';
import { expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import { commonDirectory, packageForVercel } from '../src/package';

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspace = yield* fs.makeTempDirectoryScoped({ prefix: 'ersc-vercel-' });
  const root = path.join(workspace, 'apps/with spaces');
  const serverEntry = path.join(workspace, 'framework/start.js');
  const write = Effect.fnUntraced(function* (file: string, contents: string) {
    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    yield* fs.writeFileString(file, contents);
  });
  yield* write(serverEntry, 'export async function start() {}');
  yield* write(path.join(root, '.ersc/server/main.js'), 'import "dependency"; export default {};');
  yield* write(path.join(root, '.ersc/client/main.js'), 'console.log("client");');
  yield* write(path.join(root, 'public/icon.svg'), '<svg/>');
  yield* write(path.join(root, '.env.local'), 'NOT_FOR_DEPLOYMENT=secret');
  yield* write(
    path.join(workspace, 'store/dependency/package.json'),
    '{"name":"dependency","type":"module","exports":"./index.js"}',
  );
  yield* write(path.join(workspace, 'store/dependency/index.js'), 'export const value = 1;');
  yield* fs.makeDirectory(path.join(root, 'node_modules'), { recursive: true });
  yield* fs.symlink(
    path.join(workspace, 'store/dependency'),
    path.join(root, 'node_modules/dependency'),
  );
  const context = {
    root,
    serverDir: path.join(root, '.ersc/server'),
    clientDir: path.join(root, '.ersc/client'),
    publicDir: path.join(root, 'public'),
    serverEntry,
  };
  return { fs, path, root, workspace, context, write };
});

it.effect('finds a shared root for standalone and workspace installations', () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    expect(
      commonDirectory(path, '/app', '/app/node_modules/effective-rsc/dist/server/start.js'),
    ).toBe('/app');
    expect(
      commonDirectory(path, '/repo/apps/web', '/repo/packages/framework/dist/server/start.js'),
    ).toBe('/repo');
  }).pipe(Effect.provide(Path.layer)),
);

it.effect(
  'packages traced dependencies, rewrites absolute symlinks, and excludes local secrets',
  () =>
    Effect.gen(function* () {
      const { fs, path, root, context } = yield* fixture;
      yield* packageForVercel(context);
      const output = path.join(root, '.vercel/output/functions/index.func');
      const dependency = path.join(output, 'apps/with spaces/node_modules/dependency');
      const link = yield* fs.readLink(dependency);
      const source = yield* fs.readFileString(path.join(dependency, 'index.js'));
      const secretExists = yield* fs.exists(path.join(output, 'apps/with spaces/.env.local'));
      const icon = yield* fs.readFileString(path.join(output, 'apps/with spaces/public/icon.svg'));
      const client = yield* fs.readFileString(
        path.join(output, 'apps/with spaces/.ersc/client/main.js'),
      );
      const config = yield* fs.readFileString(path.join(output, '.vc-config.json'));
      expect(link).toBe('../../../store/dependency');
      expect(source).toContain('value = 1');
      expect(secretExists).toBe(false);
      expect(icon).toBe('<svg/>');
      expect(client).toContain('client');
      const decodedConfig = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(
        config,
      );
      expect(decodedConfig).toMatchObject({
        runtime: 'bun1.4.x',
        handler: 'apps/with spaces/.vercel/ersc/server.mjs',
      });
      yield* fs.writeFileString(path.join(output, 'stale.js'), 'old build');
      yield* packageForVercel(context);
      const staleExists = yield* fs.exists(path.join(output, 'stale.js'));
      expect(staleExists).toBe(false);
    }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

it.effect('fails unresolved dependency tracing before replacing an existing output', () =>
  Effect.gen(function* () {
    const { fs, path, root, context, write } = yield* fixture;
    const marker = path.join(root, '.vercel/output/previous.json');
    yield* write(marker, 'keep');
    yield* write(
      path.join(root, '.ersc/server/main.js'),
      'import "missing-package-for-ersc-test";',
    );
    const error = yield* packageForVercel(context).pipe(Effect.flip);
    expect(error).toMatchObject({ _tag: 'VercelBuildError' });
    const previous = yield* fs.readFileString(marker);
    expect(previous).toBe('keep');
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

for (const condition of ['bun', 'node', 'node-addons']) {
  it.effect(`packages the ${condition} export selected by Bun`, () =>
    Effect.gen(function* () {
      const { fs, path, root, workspace, context, write } = yield* fixture;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      yield* write(
        path.join(workspace, 'store/dependency/package.json'),
        `{"name":"dependency","type":"module","exports":{"${condition}":"./selected.js","default":"./fallback.js"}}`,
      );
      yield* write(
        path.join(workspace, 'store/dependency/selected.js'),
        'console.log("selected");',
      );
      yield* write(
        path.join(workspace, 'store/dependency/fallback.js'),
        'console.log("fallback");',
      );
      yield* packageForVercel(context);
      const output = path.join(root, '.vercel/output/functions/index.func');
      const selected = yield* fs.exists(path.join(output, 'store/dependency/selected.js'));
      expect(selected).toBe(true);
      const result = yield* spawner.string(
        ChildProcess.make('bun', ['apps/with spaces/.ersc/server/main.js'], { cwd: output }),
      );
      expect(result.trim()).toBe('selected');
    }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
  );
}

it.effect('restores the application cwd before importing the relocated entry', () =>
  Effect.gen(function* () {
    const { fs, path, root, context, write } = yield* fixture;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    yield* write(path.join(root, 'content.md'), 'packaged content');
    yield* write(
      path.join(context.serverDir, 'main.js'),
      `import { readFileSync } from 'node:fs';
import { join } from 'node:path';
console.log(readFileSync(join(process.cwd(), 'content.md'), 'utf8'));
`,
    );
    yield* write(
      context.serverEntry,
      `import '../apps/with spaces/.ersc/server/main.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const content = readFileSync(join(process.cwd(), 'content.md'), 'utf8');
export async function start() { console.log(content); }
`,
    );
    yield* packageForVercel(context);
    const isolated = yield* fs.makeTempDirectoryScoped({ prefix: 'ersc-vercel-isolated-' });
    const output = path.join(isolated, 'index.func');
    yield* fs.rename(path.join(root, '.vercel/output/functions/index.func'), output);
    const content = yield* fs.readFileString(path.join(output, 'apps/with spaces/content.md'));
    expect(content).toBe('packaged content');
    const result = yield* spawner.string(
      ChildProcess.make('bun', ['apps/with spaces/.vercel/ersc/server.mjs'], { cwd: output }),
    );
    expect(result.trim()).toBe('packaged content\npackaged content');
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

it.effect(
  'retraces hoisted dependencies and their transitive imports outside the initial root',
  () =>
    Effect.gen(function* () {
      const { fs, path, root, workspace, context, write } = yield* fixture;
      const serverEntry = path.join(root, 'framework/start.js');
      yield* write(serverEntry, 'export async function start() {}');
      yield* write(path.join(context.serverDir, 'main.js'), 'import "hoisted";');
      yield* write(
        path.join(workspace, 'apps/node_modules/hoisted/package.json'),
        '{"name":"hoisted","type":"module","exports":"./index.js"}',
      );
      yield* write(
        path.join(workspace, 'apps/node_modules/hoisted/index.js'),
        'export { value } from "transitive";',
      );
      yield* write(
        path.join(workspace, 'node_modules/transitive/package.json'),
        '{"name":"transitive","type":"module","exports":"./index.js"}',
      );
      yield* write(
        path.join(workspace, 'node_modules/transitive/index.js'),
        'export const value = 42;',
      );
      yield* write(path.join(workspace, 'unrelated/private.txt'), 'must not be copied');
      yield* packageForVercel({ ...context, serverEntry });
      const output = path.join(root, '.vercel/output/functions/index.func');
      const hoisted = yield* fs.readFileString(
        path.join(output, 'apps/node_modules/hoisted/index.js'),
      );
      const transitive = yield* fs.readFileString(
        path.join(output, 'node_modules/transitive/index.js'),
      );
      const unrelated = yield* fs.exists(path.join(output, 'unrelated/private.txt'));
      expect(hoisted).toContain('transitive');
      expect(transitive).toContain('42');
      expect(unrelated).toBe(false);
    }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

it.effect('copies linked public directories and client files as self-contained assets', () =>
  Effect.gen(function* () {
    const { fs, path, root, workspace, context, write } = yield* fixture;
    const shared = path.join(workspace, 'shared');
    yield* write(path.join(shared, 'images/logo.svg'), '<svg>shared</svg>');
    yield* write(path.join(shared, 'client.js'), 'shared client');
    yield* fs.symlink(path.join(shared, 'images'), path.join(context.publicDir, 'images'));
    yield* fs.symlink('images/logo.svg', path.join(context.publicDir, 'alias.svg'));
    yield* fs.symlink(path.join(shared, 'client.js'), path.join(context.clientDir, 'linked.js'));
    yield* packageForVercel(context);
    // Removing fixture-owned targets proves the deployed assets no longer rely on their links.
    yield* fs.remove(shared, { recursive: true });
    const output = path.join(root, '.vercel/output/functions/index.func/apps/with spaces');
    const logo = yield* fs.readFileString(path.join(output, 'public/images/logo.svg'));
    const alias = yield* fs.readFileString(path.join(output, 'public/alias.svg'));
    const client = yield* fs.readFileString(path.join(output, '.ersc/client/linked.js'));
    expect(logo).toBe('<svg>shared</svg>');
    expect(alias).toBe(logo);
    expect(client).toBe('shared client');
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

for (const target of ['missing.svg', '.', '../../..']) {
  it.effect(`rejects broken, cyclic, or self-containing asset links: ${target}`, () =>
    Effect.gen(function* () {
      const { fs, path, root, context } = yield* fixture;
      yield* fs.symlink(target, path.join(context.publicDir, 'invalid'));
      const error = yield* packageForVercel(context).pipe(Effect.flip);
      expect(error).toMatchObject({ _tag: 'VercelBuildError' });
      const complete = yield* fs.exists(path.join(root, '.vercel/output/config.json'));
      expect(complete).toBe(false);
    }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
  );
}
