import * as BunServices from '@effect/platform-bun/BunServices';
import { expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import PackageJson from '../package.json' with { type: 'json' };

it.effect('runs the published executable and resolves its packaged template', () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const packageRoot = path.resolve(yield* path.fromFileUrl(new URL('../', import.meta.url)));
    const executable = path.join(packageRoot, 'bin', 'create-ersc-app.js');
    const temporaryDirectory = yield* fileSystem.makeTempDirectoryScoped({
      prefix: 'create-ersc-app-distribution-',
    });
    const target = path.join(temporaryDirectory, 'Field Guide');

    const help = yield* spawner.string(ChildProcess.make('bun', [executable, '--help']));
    const version = yield* spawner.string(ChildProcess.make('bun', [executable, '--version']));
    const exitCode = yield* spawner.exitCode(
      ChildProcess.make('bun', [executable, target, '--no-install']),
    );
    const executableSource = yield* fileSystem.readFileString(executable);
    const packageJson = yield* fileSystem.readFileString(path.join(target, 'package.json'));

    expect(PackageJson.bin['create-ersc-app']).toBe('./bin/create-ersc-app.js');
    expect(executableSource).toBe("#!/usr/bin/env bun\n\nimport '../dist/cli.js';\n");
    expect(help).toContain('create-ersc-app [flags] <directory>');
    expect(help).toContain('--no-install');
    expect(version.trim()).toBe(`create-ersc-app v${PackageJson.version}`);
    expect(exitCode).toBe(ChildProcessSpawner.ExitCode(0));
    expect(packageJson).toContain('"name": "field-guide"');
    expect(packageJson).not.toContain('__PROJECT_NAME__');
    expect(packageJson).not.toContain('__EFFECTIVE_RSC_VERSION__');
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);
