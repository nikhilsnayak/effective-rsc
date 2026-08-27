import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect } from 'effect';
import {
  Argument,
  CliConfig,
  CliError,
  Command,
  Flag,
  GlobalFlag,
  Prompt,
} from 'effect/unstable/cli';

import PackageJson from '../package.json' with { type: 'json' };
import { createApplication } from './create-app';

const directory = Argument.string('directory').pipe(
  Argument.withDescription('Directory for the new application'),
  Argument.withFallbackPrompt(
    Prompt.text({
      message: 'Where should the application be created?',
      validate: (value) =>
        value.trim().length > 0 ? Effect.succeed(value) : Effect.fail('Enter a directory.'),
    }),
  ),
);

const noInstall = Flag.boolean('no-install').pipe(
  Flag.withDescription('Skip dependency installation'),
  Flag.withDefault(false),
);

const cli = Command.make(
  'create-ersc-app',
  { directory, noInstall },
  Effect.fn(function* ({ directory, noInstall }) {
    yield* createApplication({
      directory,
      frameworkVersion: PackageJson.version,
      install: !noInstall,
      templateUrl: Bun.pathToFileURL(`${import.meta.dir}/../template/`),
    }).pipe(Effect.mapError((cause) => new CliError.UserError({ cause })));
  }),
).pipe(
  Command.withDescription('Create a new effective-rsc application.'),
  Command.withExamples([
    {
      command: 'create-ersc-app my-application',
      description: 'Create an application and install its dependencies',
    },
    {
      command: 'create-ersc-app my-application --no-install',
      description: 'Create an application without installing dependencies',
    },
  ]),
);

const program = Command.run(cli, { version: PackageJson.version }).pipe(
  Effect.provide([
    CliConfig.layer({
      builtIns: [GlobalFlag.Help, GlobalFlag.Version],
    }),
    BunServices.layer,
  ]),
);

BunRuntime.runMain(program);
