import { Effect, Path, Schema } from 'effect';

import { makeBuildConfig } from './config';
import { Rsbuild } from './rsbuild';

export type BuildOptions = {
  readonly root: string;
};

const ApplicationEntryPath = 'src/application.tsx';
const ApplicationStylesheetPath = 'src/styles.css';

export class BuildEntryError extends Schema.TaggedError<BuildEntryError>()('BuildEntryError', {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

const ClientEntryUrl = new URL('../client/entry.ts', import.meta.url);
const RscEntryUrl = new URL('./rsc-entry.ts', import.meta.url);
const SsrEntryUrl = new URL('../server/ssr.tsx', import.meta.url);

const resolveFrameworkEntry = Effect.fnUntraced(function* (url: URL) {
  const path = yield* Path.Path;

  return yield* path.fromFileUrl(url).pipe(
    Effect.mapError(
      (cause) =>
        new BuildEntryError({
          message: `Failed to convert the framework entry ${url.href} to a file path.`,
          cause,
        }),
    ),
  );
});

export const resolveApplicationBuild = Effect.fnUntraced(function* ({ root }: BuildOptions) {
  const path = yield* Path.Path;
  const applicationRoot = path.resolve(root);
  const applicationPath = path.resolve(applicationRoot, ApplicationEntryPath);
  const clientEntry = yield* resolveFrameworkEntry(ClientEntryUrl);
  const rscEntry = yield* resolveFrameworkEntry(RscEntryUrl);
  const ssrEntry = yield* resolveFrameworkEntry(SsrEntryUrl);
  const stylesheetPath = path.resolve(applicationRoot, ApplicationStylesheetPath);

  const entries = {
    application: applicationPath,
    client: clientEntry,
    rsc: rscEntry,
    ssr: ssrEntry,
    stylesheet: stylesheetPath,
  };

  return { applicationRoot, entries } as const;
});

export const build = Effect.fn('effective-rsc/rsbuild/build')(function* (options: BuildOptions) {
  const { applicationRoot, entries } = yield* resolveApplicationBuild(options);
  const rsbuild = yield* Rsbuild;

  yield* rsbuild.build(makeBuildConfig(applicationRoot, entries));
});
