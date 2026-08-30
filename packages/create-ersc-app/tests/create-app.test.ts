import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import RootPackageJson from '../../../package.json' with { type: 'json' };
import FrameworkPackageJson from '../../effective-rsc/package.json' with { type: 'json' };
import CliPackageJson from '../package.json' with { type: 'json' };
import { createApplication } from '../src/create-app';
import TemplatePackageJson from '../template/package.json' with { type: 'json' };

const TemplateUrl = new URL('../template/', import.meta.url);
const ConfiguredPackageJson = Schema.fromJsonString(
  Schema.Struct({
    dependencies: Schema.Record(Schema.String, Schema.String),
    name: Schema.String,
    scripts: Schema.Record(Schema.String, Schema.String),
  }),
);

describe('createApplication', () => {
  it('keeps the template aligned with the compatible workspace versions', () => {
    expect(CliPackageJson.version).toBe(FrameworkPackageJson.version);
    expect(TemplatePackageJson.dependencies['effective-rsc']).toBe(CliPackageJson.version);

    for (const dependency of [
      '@effect/platform-browser',
      '@effect/platform-bun',
      'effect',
      'react',
      'react-dom',
      'react-server-dom-rspack',
    ] as const) {
      expect(TemplatePackageJson.dependencies[dependency]).toBe(
        RootPackageJson.catalog[dependency],
      );
    }

    expect(TemplatePackageJson.devDependencies['@types/bun']).toBe(
      RootPackageJson.catalog['@types/bun'],
    );
    expect(TemplatePackageJson.devDependencies['@types/react']).toBe(
      RootPackageJson.catalog['@types/react'],
    );
    expect(TemplatePackageJson.devDependencies['@types/react-dom']).toBe(
      RootPackageJson.catalog['@types/react-dom'],
    );
    expect(TemplatePackageJson.devDependencies.tailwindcss).toBe(
      RootPackageJson.catalog.tailwindcss,
    );
    expect(TemplatePackageJson.devDependencies.typescript).toBe(RootPackageJson.catalog.typescript);
  });

  it.effect('copies and configures the application template', () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const temporaryDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: 'create-ersc-app-',
      });
      const target = path.join(temporaryDirectory, 'Reading Room');

      const result = yield* createApplication({
        directory: target,
        frameworkVersion: '1.2.3',
        install: false,
        templateUrl: TemplateUrl,
      });

      const packageJson = yield* fileSystem.readFileString(path.join(target, 'package.json'));
      const application = yield* fileSystem.readFileString(
        path.join(target, 'src', 'application.tsx'),
      );
      const configuredPackageJson = yield* Schema.decodeEffect(ConfiguredPackageJson)(packageJson);

      expect(result).toEqual({ directory: target, packageName: 'reading-room' });
      expect(configuredPackageJson.name).toBe('reading-room');
      expect(configuredPackageJson.dependencies['effective-rsc']).toBe('1.2.3');
      expect(configuredPackageJson.scripts['dev']).toBe('ersc dev');
      const gitignoreExists = yield* fileSystem.exists(path.join(target, '.gitignore'));
      const templateGitignoreExists = yield* fileSystem.exists(path.join(target, 'gitignore'));
      const robots = yield* fileSystem.readFileString(path.join(target, 'public', 'robots.txt'));
      expect(gitignoreExists).toBe(true);
      expect(templateGitignoreExists).toBe(false);
      expect(robots).toBe('User-agent: *\nAllow: /\n');
      expect(application).toContain('<title>effective-rsc application</title>');
      expect(application).toContain("import './styles.css';");
    }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
  );

  it.effect('runs Bun installation in the configured target directory', () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const liveSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const temporaryDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: 'create-ersc-app-install-',
      });
      const target = path.join(temporaryDirectory, 'installed-application');
      const commands: Array<ChildProcess.Command> = [];
      const spawner = ChildProcessSpawner.ChildProcessSpawner.of({
        ...liveSpawner,
        exitCode: (command) =>
          Effect.sync(() => {
            commands.push(command);
            return ChildProcessSpawner.ExitCode(0);
          }),
      });

      const result = yield* createApplication({
        directory: target,
        frameworkVersion: '1.2.3',
        install: true,
        templateUrl: TemplateUrl,
      }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner));

      expect(result).toEqual({ directory: target, packageName: 'installed-application' });
      expect(commands).toHaveLength(1);
      const command = commands[0];
      expect(command?._tag).toBe('StandardCommand');
      if (command?._tag === 'StandardCommand') {
        expect(command.command).toBe('bun');
        expect(command.args).toEqual(['install']);
        expect(command.options).toMatchObject({
          cwd: target,
          stderr: 'inherit',
          stdin: 'inherit',
          stdout: 'inherit',
        });
      }
    }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
  );

  it.effect('refuses to overwrite a non-empty directory', () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const temporaryDirectory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: 'create-ersc-app-',
      });
      const target = path.join(temporaryDirectory, 'existing');

      yield* fileSystem.makeDirectory(target);
      yield* fileSystem.writeFileString(path.join(target, 'notes.txt'), 'keep me');

      const error = yield* createApplication({
        directory: target,
        frameworkVersion: '1.2.3',
        install: false,
        templateUrl: TemplateUrl,
      }).pipe(Effect.flip);

      expect(error._tag).toBe('CreateApplicationError');
      expect(error.message).toContain('target directory is not empty');
      const notes = yield* fileSystem.readFileString(path.join(target, 'notes.txt'));
      expect(notes).toBe('keep me');
    }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
  );
});
