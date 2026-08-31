import * as BunServices from '@effect/platform-bun/BunServices';
import { expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer, Path, Stream } from 'effect';
import { vi } from 'vitest';

import { BuildClientOutputDir, DevClientOutputDir, ErscOutputDir } from '../../src/build/contract';
import { Rspack, type RspackWatchEvent } from '../../src/build/rspack';
import { makeRspackBuildConfig, makeRspackDevConfig } from '../../src/build/rspack-config';
import { DevChannelPath } from '../../src/dev/channel';

type Compiled = Extract<RspackWatchEvent, { readonly _tag: 'Compiled' }>;

const makeFixtureDirectory = Effect.fnUntraced(function* (prefix: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixtureRoot = path.join(path.resolve('.'), ErscOutputDir);

  yield* fileSystem.makeDirectory(fixtureRoot, { recursive: true });

  return yield* fileSystem.makeTempDirectoryScoped({ directory: fixtureRoot, prefix });
});

const applicationSource = (applicationModule: string, version: string) => `
  import { Effect } from 'effect';
  import { Application } from ${JSON.stringify(applicationModule)};

  const ERSC = Application.ersc();
  const RootLayout = ERSC.Layout.make({
    render: ({ children }) => Effect.succeed(<html><body>{children}</body></html>),
  });
  const HomePage = ERSC.Page.make({
    render: () => Effect.succeed(<main>${version}</main>),
  });

  export default ERSC.make({
    routes: ERSC.Routes.make({ layout: RootLayout }).page('/', HomePage),
  });
`;

const readJavaScriptOutput = Effect.fnUntraced(function* (directory: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directoryEntries = yield* fileSystem.readDirectory(directory);
  const files = directoryEntries.filter((file) => file.endsWith('.js'));
  const sources = yield* Effect.forEach(files, (file) =>
    fileSystem.readFileString(path.join(directory, file)),
  );

  return sources.join('\n');
});

it.effect(
  'recompiles the effective-rsc development graphs after an application edit',
  () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const frameworkRoot = path.resolve('.');
      const frameworkDist = path.join(frameworkRoot, 'dist');
      const applicationModule = path.join(frameworkDist, 'index.js');
      const directory = yield* makeFixtureDirectory('ersc-rspack-dev-');
      const sourceDirectory = path.join(directory, 'src');
      const application = path.join(sourceDirectory, 'application.tsx');

      yield* fileSystem.makeDirectory(sourceDirectory);
      yield* fileSystem.writeFileString(
        path.join(directory, 'tsconfig.json'),
        `{
        "compilerOptions": {
          "jsx": "react-jsx",
          "module": "ESNext",
          "moduleResolution": "Bundler",
          "strict": true,
          "target": "ESNext"
        },
        "include": ["src"]
      }`,
      );
      yield* fileSystem.writeFileString(application, applicationSource(applicationModule, 'first'));

      const rspack = yield* Rspack;
      const onCompilationStart = vi.fn();
      const onServerComponentChanges = vi.fn();
      const compilations = yield* rspack
        .watch(
          makeRspackDevConfig(
            directory,
            {
              application,
              client: path.join(frameworkDist, 'client/entry.js'),
              rsc: path.join(frameworkDist, 'build/rsc-entry.js'),
              ssr: path.join(frameworkDist, 'server/html-renderer.js'),
            },
            { onCompilationStart, onServerComponentChanges },
          ),
        )
        .pipe(
          Stream.mapEffect((event) =>
            event._tag === 'Failed' ? Effect.fail(event.error) : Effect.succeed(event),
          ),
          Stream.filter((event): event is Compiled => event._tag === 'Compiled'),
          Stream.zipWithIndex,
          Stream.tap(([, index]) =>
            index === 0
              ? fileSystem.writeFileString(
                  application,
                  applicationSource(applicationModule, 'second'),
                )
              : Effect.void,
          ),
          Stream.take(2),
          Stream.runCollect,
        );

      const hashes = Array.from(compilations, ([compilation]) => compilation.hash);
      expect(hashes).toHaveLength(2);
      expect(hashes[1]).not.toBe(hashes[0]);
      expect(onCompilationStart).toHaveBeenCalledTimes(2);
      expect(onServerComponentChanges).toHaveBeenCalledTimes(1);
      const clientOutput = yield* readJavaScriptOutput(path.join(directory, DevClientOutputDir));
      expect(clientOutput).toContain(DevChannelPath);
    }).pipe(Effect.provide(Layer.merge(BunServices.layer, Rspack.layer)), Effect.scoped),
  15_000,
);

it.effect(
  'eliminates the development runtime from production browser output',
  () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const frameworkRoot = path.resolve('.');
      const frameworkDist = path.join(frameworkRoot, 'dist');
      const applicationModule = path.join(frameworkDist, 'index.js');
      const directory = yield* makeFixtureDirectory('ersc-rspack-build-');
      const sourceDirectory = path.join(directory, 'src');
      const application = path.join(sourceDirectory, 'application.tsx');

      yield* fileSystem.makeDirectory(sourceDirectory);
      yield* fileSystem.writeFileString(
        path.join(directory, 'tsconfig.json'),
        `{
        "compilerOptions": {
          "jsx": "react-jsx",
          "module": "ESNext",
          "moduleResolution": "Bundler",
          "strict": true,
          "target": "ESNext"
        },
        "include": ["src"]
      }`,
      );
      yield* fileSystem.writeFileString(
        application,
        applicationSource(applicationModule, 'production'),
      );

      const rspack = yield* Rspack;
      yield* rspack.build(
        makeRspackBuildConfig(directory, {
          application,
          client: path.join(frameworkDist, 'client/entry.js'),
          rsc: path.join(frameworkDist, 'build/rsc-entry.js'),
          ssr: path.join(frameworkDist, 'server/html-renderer.js'),
        }),
      );

      const clientOutput = yield* readJavaScriptOutput(path.join(directory, BuildClientOutputDir));
      expect(clientOutput).not.toContain(DevChannelPath);
      expect(clientOutput).not.toContain('ersc-dev-refresh');
      expect(clientOutput).not.toContain('ersc-dev-panel');
    }).pipe(Effect.provide(Layer.merge(BunServices.layer, Rspack.layer)), Effect.scoped),
  15_000,
);
