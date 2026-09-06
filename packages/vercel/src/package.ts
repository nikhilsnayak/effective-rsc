// FileSystem.stat follows symlinks; packaging needs to preserve the links themselves.
// oxlint-disable-next-line effecttsgo/node-builtin-import
import { lstat } from 'node:fs/promises';

import { nodeFileTrace } from '@vercel/nft';
import { Effect, FileSystem, Path, Schema } from 'effect';
import type { BuildContext } from 'effective-rsc/build';

export class VercelBuildError extends Schema.TaggedError<VercelBuildError>()('VercelBuildError', {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

export const commonDirectory = (
  path: Path.Path,
  applicationRoot: string,
  serverEntry: string,
): string => {
  let base = path.resolve(applicationRoot);
  while (path.relative(base, serverEntry).split(path.sep).includes('..')) {
    base = path.dirname(base);
  }
  return base;
};

const traceDependencies = Effect.fnUntraced(function* (
  applicationRoot: string,
  frameworkEntry: string,
  entries: ReadonlyArray<string>,
) {
  const path = yield* Path.Path;
  // Files outside NFT's base are omitted: https://github.com/vercel/nft#base
  let base = commonDirectory(path, applicationRoot, frameworkEntry);
  while (true) {
    const trace = yield* Effect.tryPromise({
      try: () =>
        nodeFileTrace([...entries], {
          base,
          processCwd: applicationRoot,
          // Custom conditions replace NFT's defaults: https://github.com/vercel/nft#exports--imports
          conditions: ['bun', 'node', 'node-addons'],
          mixedModules: true,
        }),
      catch: (cause) =>
        new VercelBuildError({ message: 'Failed to trace deployment dependencies.', cause }),
    });
    if (trace.warnings.size > 0) {
      return yield* new VercelBuildError({
        message: 'Could not trace every deployment dependency.',
        cause: new AggregateError(trace.warnings),
      });
    }
    let expandedBase = base;
    // NFT silently ignores dependencies outside base, without emitting a warning.
    for (const [file, reason] of trace.reasons) {
      if (reason.ignored) {
        expandedBase = commonDirectory(path, expandedBase, path.resolve(base, file));
      }
    }
    if (expandedBase === base) {
      return { base, files: trace.fileList };
    }
    base = expandedBase;
  }
});

const copyAssets: (
  source: string,
  destination: string,
  ancestors: ReadonlyArray<string>,
) => Effect.Effect<void, VercelBuildError, FileSystem.FileSystem | Path.Path> = Effect.fnUntraced(
  function* (source, destination, ancestors) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    // Copy asset link targets; their original locations will not exist after deployment.
    const resolved = yield* fs.realPath(source);
    const info = yield* fs.stat(resolved);
    if (info.type === 'Directory') {
      if (destination === resolved || destination.startsWith(`${resolved}${path.sep}`)) {
        return yield* new VercelBuildError({
          message: `Asset directory ${source} contains the deployment destination.`,
          cause: resolved,
        });
      }
      if (ancestors.includes(resolved)) {
        return yield* new VercelBuildError({
          message: `Asset directory ${source} contains a cyclic symlink.`,
          cause: resolved,
        });
      }
      yield* fs.makeDirectory(destination, { recursive: true });
      const entries = yield* fs.readDirectory(resolved);
      for (const entry of entries) {
        yield* copyAssets(path.join(resolved, entry), path.join(destination, entry), [
          ...ancestors,
          resolved,
        ]);
      }
    } else if (info.type === 'File') {
      yield* fs.copyFile(resolved, destination);
    } else {
      return yield* new VercelBuildError({
        message: `Asset ${source} is not a regular file or directory.`,
        cause: info.type,
      });
    }
  },
  Effect.mapError(
    (cause) => new VercelBuildError({ message: 'Failed to copy deployment assets.', cause }),
  ),
);

export const packageForVercel = Effect.fn('@ersc/vercel/packageForVercel')(function* ({
  root,
  serverDir,
  clientDir,
  publicDir,
  serverEntry,
}: BuildContext & {
  readonly serverEntry: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const applicationRoot = yield* fs.realPath(root);
  const frameworkEntry = yield* fs.realPath(serverEntry);
  const bootDirectory = path.join(applicationRoot, '.vercel/ersc');
  const bootFile = path.join(bootDirectory, 'server.mjs');
  const output = path.join(applicationRoot, '.vercel/output');
  // A .func directory must contain every runtime file: https://vercel.com/docs/build-output-api/primitives#functions
  const functionDirectory = path.join(output, 'functions/index.func');
  const moduleSpecifier = path.relative(bootDirectory, frameworkEntry).split(path.sep).join('/');

  yield* fs.makeDirectory(bootDirectory, { recursive: true });
  // Bun.serve entrypoints: https://vercel.com/docs/functions/runtimes/bun#deploy-with-the-bun-framework-preset
  // App-relative file reads: https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions
  // Change cwd before importing: module initialization may read application files.
  yield* fs.writeFileString(
    bootFile,
    `import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
const { start } = await import(${encodeJson(moduleSpecifier.startsWith('.') ? moduleSpecifier : `./${moduleSpecifier}`)});
// Hostname and port are local-only; Vercel handles incoming traffic.
await start({ root, hostname: 'localhost', port: 18193 });
`,
  );

  // Seed every server chunk; runtime-selected imports may be invisible to tracing.
  const serverFiles = yield* fs.readDirectory(serverDir, { recursive: true });
  const { base, files } = yield* traceDependencies(applicationRoot, frameworkEntry, [
    bootFile,
    ...serverFiles.filter((file) => file.endsWith('.js')).map((file) => path.join(serverDir, file)),
  ]);

  // Keep the previous output if dependency tracing fails.
  yield* fs.remove(output, { recursive: true, force: true });
  yield* fs.makeDirectory(functionDirectory, { recursive: true });
  yield* Effect.forEach(files, (file) =>
    Effect.gen(function* () {
      const source = path.join(base, file);
      const destination = path.join(functionDirectory, file);
      const info = yield* Effect.tryPromise({
        try: () => lstat(source),
        catch: (cause) => new VercelBuildError({ message: `Failed to inspect ${file}.`, cause }),
      });
      yield* fs.makeDirectory(path.dirname(destination), { recursive: true });
      if (info.isSymbolicLink()) {
        const target = yield* fs.readLink(source);
        const targetPath = path.resolve(path.dirname(source), target);
        const relativeTarget = path.relative(base, targetPath);
        if (relativeTarget.split(path.sep).includes('..')) {
          return yield* new VercelBuildError({
            message: `Dependency ${file} points outside the deployment root.`,
            cause: target,
          });
        }
        // Rebase links onto the copied tree, including originally absolute links.
        yield* fs.symlink(
          path.relative(path.dirname(destination), path.join(functionDirectory, relativeTarget)),
          destination,
        );
      } else if (info.isFile()) {
        yield* fs.copyFile(source, destination);
      }
    }),
  );

  const deployedRoot = path.join(functionDirectory, path.relative(base, applicationRoot));
  for (const source of [clientDir, publicDir]) {
    // Directory entries distinguish missing assets from broken symlinks.
    const entries = yield* fs.readDirectory(path.dirname(source));
    if (entries.includes(path.basename(source))) {
      const destination = path.join(deployedRoot, path.relative(root, source));
      // Remove any traced symlink before copying files into this location.
      yield* fs.remove(destination, { recursive: true, force: true });
      yield* copyAssets(source, destination, []);
    }
  }
  // Function config and launcher: https://vercel.com/docs/build-output-api/primitives#serverless-function-configuration
  yield* fs.writeFileString(
    path.join(functionDirectory, '.vc-config.json'),
    encodeJson({
      // Bun runtime series: https://vercel.com/docs/functions/runtimes/bun#configuring-the-runtime
      runtime: 'bun1.4.x',
      handler: path.relative(base, bootFile).split(path.sep).join('/'),
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
    }),
  );
  // Route all methods through the app: https://vercel.com/docs/build-output-api/configuration#routes
  yield* fs.writeFileString(
    path.join(output, 'config.json'),
    encodeJson({ version: 3, routes: [{ src: '/(.*)', dest: '/index' }] }),
  );
});
