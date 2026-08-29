import { Effect, Path, Schema } from 'effect';

import { ApplicationEntryPath } from './contract';
import { Rspack } from './rspack';
import { makeRspackBuildConfig } from './rspack-config';

export type BuildOptions = {
  readonly root: string;
};

export type ResolveApplicationBuildOptions = BuildOptions & {
  readonly buildModuleUrl?: URL;
};

export class BuildEntryError extends Schema.TaggedError<BuildEntryError>()('BuildEntryError', {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

const ClientEntryPath = '../client/entry.js';
const DevClientEntryPath = '../dev/entry.js';
const RscEntryPath = './rsc-entry.js';
const SsrEntryPath = '../server/html-renderer.js';

const resolveFrameworkEntry = Effect.fnUntraced(function* (
  buildModuleUrl: URL,
  relativePath: string,
) {
  const path = yield* Path.Path;

  const buildModulePath = yield* path.fromFileUrl(buildModuleUrl).pipe(
    Effect.mapError(
      (cause) =>
        new BuildEntryError({
          message: `Failed to convert the framework build module ${buildModuleUrl.href} to a file path.`,
          cause,
        }),
    ),
  );

  return path.resolve(path.dirname(buildModulePath), relativePath);
});

export const resolveApplicationBuild = Effect.fnUntraced(function* ({
  root,
  buildModuleUrl = new URL(import.meta.url),
}: ResolveApplicationBuildOptions) {
  const path = yield* Path.Path;
  const applicationRoot = path.resolve(root);
  const applicationPath = path.resolve(applicationRoot, ApplicationEntryPath);
  const clientEntry = yield* resolveFrameworkEntry(buildModuleUrl, ClientEntryPath);
  const devClientEntry = yield* resolveFrameworkEntry(buildModuleUrl, DevClientEntryPath);
  const rscEntry = yield* resolveFrameworkEntry(buildModuleUrl, RscEntryPath);
  const ssrEntry = yield* resolveFrameworkEntry(buildModuleUrl, SsrEntryPath);
  const entries = {
    application: applicationPath,
    client: clientEntry,
    devClient: devClientEntry,
    rsc: rscEntry,
    ssr: ssrEntry,
  };

  return { applicationRoot, entries } as const;
});

export const build = Effect.fn('ersc/rspack/build')(function* (options: BuildOptions) {
  const { applicationRoot, entries } = yield* resolveApplicationBuild(options);
  const rspack = yield* Rspack;

  yield* rspack.build(makeRspackBuildConfig(applicationRoot, entries));
});

export const buildApplication = Effect.fn('ersc/build/buildApplication')(function* (
  options: BuildOptions,
) {
  yield* build(options).pipe(Effect.provide(Rspack.layer), Effect.scoped);
});
