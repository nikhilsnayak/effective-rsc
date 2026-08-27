import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';

import RootPackageJson from '../../../package.json' with { type: 'json' };
import FrameworkPackageJson from '../../effective-rsc/package.json' with { type: 'json' };
import CliPackageJson from '../package.json' with { type: 'json' };
import { createApplication } from '../src/create-app';
import TemplatePackageJson from '../template/package.json' with { type: 'json' };

const TemplateUrl = new URL('../template/', import.meta.url);

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

      expect(result).toEqual({ directory: target, packageName: 'reading-room' });
      expect(packageJson).toContain('"name": "reading-room"');
      expect(packageJson).toContain('"effective-rsc": "1.2.3"');
      expect(packageJson).toMatch(
        /^\{\n  "name": "reading-room",\n  "version": "0\.0\.0",\n  "private": true,\n  "type": "module",\n  "scripts":/,
      );
      expect(packageJson.indexOf('"scripts"')).toBeLessThan(packageJson.indexOf('"dependencies"'));
      expect(packageJson.indexOf('"dependencies"')).toBeLessThan(
        packageJson.indexOf('"devDependencies"'),
      );
      expect(yield* fileSystem.exists(path.join(target, '.gitignore'))).toBe(true);
      expect(yield* fileSystem.exists(path.join(target, 'gitignore'))).toBe(false);
      expect(application).toContain("import './styles.css';");
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
      expect(yield* fileSystem.readFileString(path.join(target, 'notes.txt'))).toBe('keep me');
    }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
  );
});
