import { Console, Effect, FileSystem, Path, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

export class CreateApplicationError extends Schema.TaggedError<CreateApplicationError>()(
  'CreateApplicationError',
  {
    message: Schema.String,
  },
) {}

export type CreateApplicationOptions = {
  readonly directory: string;
  readonly frameworkVersion: string;
  readonly install: boolean;
  readonly templateUrl: URL;
};

const PackageJson = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown), {
  space: 2,
});
const PackageJsonFields = Schema.Struct({
  dependencies: Schema.Record(Schema.String, Schema.String),
  name: Schema.String,
});

const packageNameFromDirectory = (directoryName: string) =>
  directoryName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9~-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 214)
    .replace(/-+$/g, '');

const shellArgument = (value: string) =>
  /^[A-Za-z0-9_./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;

export const createApplication = Effect.fn('create-ersc-app/createApplication')(function* (
  options: CreateApplicationOptions,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = path.resolve(options.directory);
  const packageName = packageNameFromDirectory(path.basename(directory));

  if (packageName.length === 0) {
    return yield* new CreateApplicationError({
      message: `Cannot derive a package name from ${path.basename(directory)}.`,
    });
  }

  if (yield* fileSystem.exists(directory)) {
    const entries = yield* fileSystem.readDirectory(directory);

    if (entries.length > 0) {
      return yield* new CreateApplicationError({
        message: `The target directory is not empty: ${directory}`,
      });
    }
  }

  const templateDirectory = yield* path.fromFileUrl(options.templateUrl);

  yield* Console.log(`Creating ${packageName} in ${directory}`);
  yield* fileSystem.copy(templateDirectory, directory);
  yield* fileSystem.rename(path.join(directory, 'gitignore'), path.join(directory, '.gitignore'));

  const packageJsonPath = path.join(directory, 'package.json');
  const packageJsonSource = yield* fileSystem.readFileString(packageJsonPath);
  const packageJson = yield* Schema.decodeEffect(PackageJson)(packageJsonSource).pipe(
    Effect.mapError(() => new TypeError('The application template package.json is invalid.')),
    Effect.orDie,
  );
  const packageJsonFields = yield* Schema.decodeUnknownEffect(PackageJsonFields)(packageJson).pipe(
    Effect.mapError(() => new TypeError('The application template package.json is invalid.')),
    Effect.orDie,
  );
  const configuredPackageJson = yield* Schema.encodeEffect(PackageJson)({
    ...packageJson,
    dependencies: {
      ...packageJsonFields.dependencies,
      'effective-rsc': options.frameworkVersion,
    },
    name: packageName,
  }).pipe(
    Effect.mapError(() => new TypeError('The configured application package.json is invalid.')),
    Effect.orDie,
    Effect.map((source) => `${source}\n`),
  );

  yield* fileSystem.writeFileString(packageJsonPath, configuredPackageJson);

  if (options.install) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    yield* Console.log('Installing dependencies with Bun');

    const exitCode = yield* spawner.exitCode(
      ChildProcess.make('bun', ['install'], {
        cwd: directory,
        stderr: 'inherit',
        stdin: 'inherit',
        stdout: 'inherit',
      }),
    );

    if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
      return yield* new CreateApplicationError({
        message: `bun install failed with exit code ${exitCode}.`,
      });
    }
  }

  yield* Console.log(`\nCreated ${packageName}.`);
  yield* Console.log(`\n  cd ${shellArgument(options.directory)}`);

  if (!options.install) {
    yield* Console.log('  bun install');
  }

  yield* Console.log('  bun run dev');

  return { directory, packageName } as const;
});
