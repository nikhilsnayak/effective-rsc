import { Context, Effect, FileSystem, Layer } from 'effect';

import type { BuildContext, BuildHook } from '../../src/build/hook';

class Packaging extends Context.Service<Packaging, { readonly run: Effect.Effect<void> }>()(
  'ersc/tests/types/build-hook/Packaging',
) {
  static readonly layer = Layer.succeed(Packaging, { run: Effect.void });
}

const packageApplication = Effect.flatMap(Packaging, ({ run }) => run);

const build: BuildHook = () =>
  packageApplication.pipe(
    Effect.provide(Packaging.layer),
    Effect.andThen(Effect.addFinalizer(() => Effect.void)),
  );
void build;

const customDependencyCheck: typeof packageApplication extends ReturnType<BuildHook>
  ? 'Accepted'
  : 'Rejected' = 'Rejected';
void customDependencyCheck;

const requiresFileSystem = ({ root }: BuildContext) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.makeDirectory(root));
const fileSystemCheck: ReturnType<typeof requiresFileSystem> extends ReturnType<BuildHook>
  ? 'Accepted'
  : 'Rejected' = 'Rejected';
void fileSystemCheck;
