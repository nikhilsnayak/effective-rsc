/* oxlint-disable effecttsgo/async-function, effecttsgo/node-builtin-import -- Distribution smoke test reads and executes generated package files at the process boundary. */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

const PackageRootUrl = new URL('../../', import.meta.url);
const execFileAsync = promisify(execFile);

it('publishes compiled entries while preserving package boundaries', async () => {
  const manifest = JSON.parse(await readFile(new URL('package.json', PackageRootUrl), 'utf8')) as {
    readonly bin: { readonly ersc: string };
    readonly engines: { readonly bun: string };
    readonly exports: {
      readonly '.': {
        readonly default: string;
        readonly 'react-server': string;
        readonly types: string;
      };
    };
    readonly files: ReadonlyArray<string>;
    readonly license: string;
    readonly version: string;
  };
  const binPath = fileURLToPath(new URL('bin/ersc.js', PackageRootUrl));
  const binModule = await readFile(binPath, 'utf8');
  const cliModule = await readFile(new URL('dist/cli.js', PackageRootUrl), 'utf8');
  const rscEntry = await readFile(new URL('dist/build/rsc-entry.js', PackageRootUrl), 'utf8');
  const clientModule = await readFile(new URL('dist/client/route-tree.js', PackageRootUrl), 'utf8');
  const sourceMap = JSON.parse(
    await readFile(new URL('dist/build/rsc-entry.js.map', PackageRootUrl), 'utf8'),
  ) as { readonly sourcesContent?: ReadonlyArray<string> };
  const { stderr: versionError, stdout: versionOutput } = await execFileAsync('bun', [
    binPath,
    '--version',
  ]);
  const { stderr: startHelpError, stdout: startHelpOutput } = await execFileAsync('bun', [
    binPath,
    'start',
    '--help',
  ]);
  const defaultImport = await execFileAsync(
    'bun',
    ['--eval', "import('effective-rsc').catch((error) => process.stdout.write(error.message))"],
    { cwd: fileURLToPath(PackageRootUrl) },
  );
  const reactServerImport = await execFileAsync(
    'bun',
    [
      '--conditions=react-server',
      '--eval',
      "const module = await import('effective-rsc'); process.stdout.write(typeof module.Application)",
    ],
    { cwd: fileURLToPath(PackageRootUrl) },
  );

  expect(manifest.bin.ersc).toBe('./bin/ersc.js');
  expect(manifest.engines.bun).toBe('>=1.4.0');
  expect(manifest.exports['.']).toMatchObject({
    default: './dist/unsupported.js',
    'react-server': './dist/index.js',
    types: './dist/index.d.ts',
  });
  expect(manifest.files).toEqual([
    'bin/ersc.js',
    'dist',
    'docs',
    'LICENSE',
    'LLMS.md',
    'README.md',
  ]);
  expect(manifest.license).toBe('MIT');
  expect(binModule).toBe("#!/usr/bin/env bun\n\nimport '../dist/cli.js';\n");
  expect(cliModule).not.toMatch(/^#!/);
  expect(cliModule).toContain('import("./build/build.js")');
  expect(cliModule).not.toContain('@rspack/core');
  expect(cliModule).not.toContain('@tailwindcss/webpack');
  expect(versionError).toBe('');
  expect(versionOutput.trim()).toBe(`ersc v${manifest.version}`);
  expect(startHelpError).toBe('');
  expect(startHelpOutput).toContain('--hostname string');
  expect(startHelpOutput).toContain('--port integer');
  expect(startHelpOutput).toContain('defaults to HOST or localhost');
  expect(startHelpOutput).toContain('defaults to PORT or 18193');
  expect(defaultImport.stdout).toContain('React Server Components environment');
  expect(reactServerImport.stdout).toBe('object');
  expect(rscEntry).toMatch(/^['"]use server-entry['"];?\r?\n/);
  expect(clientModule).toMatch(/^['"]use client['"];?\r?\n/);
  expect(sourceMap.sourcesContent?.[0]).toContain("'use server-entry';");
});
