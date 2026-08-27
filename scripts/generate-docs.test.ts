/* oxlint-disable effecttsgo/async-function -- Tests the standalone Bun documentation generator. */

import { expect, it } from 'vitest';

import { documentationOutput, generateDocumentation } from './generate-docs';

it('keeps the packaged agent documentation synchronized with its sources', async () => {
  expect(await generateDocumentation()).toBe(await Bun.file(documentationOutput).text());
});

it('inlines canonical examples and links broader examples', async () => {
  const documentation = await generateDocumentation();

  expect(documentation).toContain('### A minimal application');
  expect(documentation).toContain('const ERSC = Application.ersc();');
  expect(documentation).toContain(
    '[Composing and mounting Routes](./docs/02-guides/03-routing/30_routes.tsx)',
  );
  expect(documentation).not.toContain('const articleRoutes = ERSC.Routes.make');
});
