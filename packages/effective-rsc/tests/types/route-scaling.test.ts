/* oxlint-disable effecttsgo/node-builtin-import -- This test measures the installed TypeScript compiler in a separate process. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const compiler = join(
  dirname(fileURLToPath(import.meta.resolve('typescript/package.json'))),
  'bin/tsc',
);

it('quadrupling a route chain uses less than six times the type instantiations', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'ersc-route-scaling-'));
  try {
    writeFileSync(
      join(workspace, 'tsconfig.json'),
      JSON.stringify({
        extends: resolve(repository, 'tsconfig.json'),
        compilerOptions: {
          types: ['bun'],
          typeRoots: [resolve(repository, 'node_modules/@types')],
        },
        files: ['routes.ts'],
        include: [],
      }),
    );

    const measure = (count: number) => {
      const source = resolve(repository, 'packages/effective-rsc/src/application');
      writeFileSync(
        join(workspace, 'routes.ts'),
        [
          `import type { RoutesFactory } from ${JSON.stringify(join(source, 'routes'))};`,
          `import type { StaticPageDefinition, ParameterizedPageDefinition } from ${JSON.stringify(join(source, 'page'))};`,
          'declare const Routes: RoutesFactory<never>;',
          'declare const staticPage: StaticPageDefinition<never>;',
          "declare const dynamicPage: ParameterizedPageDefinition<never, 'id'>;",
          'export const routes = Routes.make()',
          ...Array.from({ length: count }, (_, index) =>
            index % 2 === 0
              ? `.page('/route${index}', staticPage)`
              : `.page('/route${index}/:id', dynamicPage)`,
          ),
          ';',
        ].join('\n'),
      );
      const diagnostics = execFileSync(
        process.execPath,
        [compiler, '--project', join(workspace, 'tsconfig.json'), '--extendedDiagnostics'],
        { encoding: 'utf8', timeout: 30_000 },
      );
      const match = diagnostics.match(/^Instantiations:\s+(\d+)/m);
      expect(match, diagnostics).not.toBeNull();
      return Number(match?.[1]);
    };

    const small = measure(100);
    const large = measure(400);
    expect(small).toBeGreaterThan(0);
    // Four times the routes allows headroom above linear growth. The old check grew by 11x.
    // Count checker work instead of elapsed time so machine load cannot change the verdict.
    expect(large, `100 routes: ${small}; 400 routes: ${large}`).toBeLessThan(small * 6);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}, 60_000);
