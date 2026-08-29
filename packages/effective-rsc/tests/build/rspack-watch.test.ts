import * as BunServices from '@effect/platform-bun/BunServices';
import { expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer, Path, Stream } from 'effect';
import { vi } from 'vitest';

import { BuildClientOutputDir, DevClientOutputDir } from '../../src/build/contract';
import { Rspack, type RspackWatchEvent } from '../../src/build/rspack';
import { makeRspackBuildConfig, makeRspackDevConfig } from '../../src/build/rspack-config';
import { DevHmrPath } from '../../src/dev/hmr';

type Compiled = Extract<RspackWatchEvent, { readonly _tag: 'Compiled' }>;

const applicationSource = (version: string) => `
  import { Effect } from 'effect';
  import { Application } from 'effective-rsc';

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
  const files = (yield* fileSystem.readDirectory(directory)).filter((file) => file.endsWith('.js'));
  const sources = yield* Effect.forEach(files, (file) =>
    fileSystem.readFileString(path.join(directory, file)),
  );

  return { files, source: sources.join('\n') };
});

it.effect(
  'recompiles the effective-rsc development graphs after an application edit',
  () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const frameworkRoot = path.resolve('.');
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        directory: frameworkRoot,
        prefix: '.ersc-rspack-dev-',
      });
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
      yield* fileSystem.writeFileString(application, applicationSource('first'));

      const rspack = yield* Rspack;
      const onCompilationStart = vi.fn();
      const onServerComponentChanges = vi.fn();
      const compilations = yield* rspack
        .watch(
          makeRspackDevConfig(
            directory,
            {
              application,
              client: path.join(frameworkRoot, 'src/client/entry.ts'),
              rsc: path.join(frameworkRoot, 'src/build/rsc-entry.ts'),
              ssr: path.join(frameworkRoot, 'src/server/html-renderer.tsx'),
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
              ? fileSystem.writeFileString(application, applicationSource('second'))
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
      expect(clientOutput.files.some((file) => file.includes('hmr-client'))).toBe(true);
      expect(clientOutput.source).toContain(DevHmrPath);
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
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        directory: frameworkRoot,
        prefix: '.ersc-rspack-build-',
      });
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
      yield* fileSystem.writeFileString(application, applicationSource('production'));

      const rspack = yield* Rspack;
      yield* rspack.build(
        makeRspackBuildConfig(directory, {
          application,
          client: path.join(frameworkRoot, 'src/client/entry.ts'),
          rsc: path.join(frameworkRoot, 'src/build/rsc-entry.ts'),
          ssr: path.join(frameworkRoot, 'src/server/html-renderer.tsx'),
        }),
      );

      const clientOutput = yield* readJavaScriptOutput(path.join(directory, BuildClientOutputDir));
      expect(clientOutput.files.some((file) => file.includes('hmr-client'))).toBe(false);
      expect(clientOutput.source).not.toContain(DevHmrPath);
      expect(clientOutput.source).not.toContain('ersc-dev-refresh');
    }).pipe(Effect.provide(Layer.merge(BunServices.layer, Rspack.layer)), Effect.scoped),
  15_000,
);
