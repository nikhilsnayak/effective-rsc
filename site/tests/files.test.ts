/* oxlint-disable effecttsgo/async-function, effecttsgo/node-builtin-import -- Documentation tests use temporary filesystem fixtures. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BunServices } from '@effect/platform-bun';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { indexDocuments, parseExample, readDocument } from '../src/docs/files';
import { sourceToHref, resolveLink, type DocPage } from '../src/docs/model';

const docsRoot = Bun.fileURLToPath(new URL('../../packages/effective-rsc/docs/', import.meta.url));
const loadIndex = (root: string) =>
  Effect.runPromise(indexDocuments(root).pipe(Effect.provide(BunServices.layer)));

describe('package documentation', () => {
  it('includes every documentation section and keeps examples separate', async () => {
    const entries = await loadIndex(docsRoot);
    const documents = entries.filter((page) => page.kind === 'Document');
    expect(new Set(documents.map((page) => page.section))).toEqual(
      new Set([
        'effective-rsc documentation',
        'Getting started',
        'Guides',
        'Advanced',
        'API reference',
      ]),
    );
    expect(documents.map((page) => page.href)).toContain('/docs/api-reference/server-fn');
    expect(
      entries.find((page) => page.href === '/docs/getting-started/first-application'),
    ).toMatchObject({
      kind: 'Example',
      title: 'A minimal application',
    });
    expect(entries.every((page) => !('markdown' in page))).toBe(true);
    const overview = entries.find((page) => page.href === '/docs');
    if (overview === undefined) {
      throw new Error('Missing overview');
    }
    const document = await Effect.runPromise(
      readDocument(docsRoot, overview).pipe(Effect.provide(BunServices.layer)),
    );
    expect(document.markdown).not.toContain('<!-- source-navigation -->');
  });

  it('maps numbered package paths to clean website paths', () => {
    expect(sourceToHref('index.md')).toBe('/docs');
    expect(sourceToHref('02-guides/04-middleware/index.md')).toBe('/docs/guides/middleware');
    expect(sourceToHref('01-getting-started/01_first-application.tsx')).toBe(
      '/docs/getting-started/first-application',
    );
  });

  it('reads the requested source file instead of retaining its body in the index', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ersc-site-docs-'));
    try {
      await Bun.write(join(root, 'index.md'), '# Docs\n\nOriginal text.');
      const [entry] = await loadIndex(root);
      if (entry === undefined) {
        throw new Error('Missing overview');
      }
      await Bun.write(join(root, 'index.md'), '# Docs\n\nUpdated text.');
      const page = await Effect.runPromise(
        readDocument(root, entry).pipe(Effect.provide(BunServices.layer)),
      );
      expect(page.markdown).toBe('Updated text.');
      await rm(join(root, 'index.md'));
      await expect(
        Effect.runPromise(readDocument(root, entry).pipe(Effect.provide(BunServices.layer))),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('resolves relative links without guessing from website slugs', () => {
    const page: DocPage = {
      kind: 'Document',
      sourcePath: '02-guides/04-middleware/index.md',
      href: '/docs/guides/middleware',
      title: 'Middleware',
      section: 'Guides',
      markdown: '',
    };
    expect(
      resolveLink('../04-middleware/index.md#services', '02-guides/03-routing/index.md', [page]),
    ).toBe('/docs/guides/middleware#services');
    expect(resolveLink('#services', page.sourcePath, [page])).toBe(
      '/docs/guides/middleware#services',
    );
    expect(resolveLink('https://effect.website', page.sourcePath, [page])).toBe(
      'https://effect.website',
    );
    expect(resolveLink('javascript:alert(1)', page.sourcePath, [page])).toBe('#');
    expect(() => resolveLink('../missing/index.md', page.sourcePath, [page])).toThrow(
      'Broken documentation link',
    );
  });

  it('extracts example titles without executing the source or breaking nested fences', () => {
    const source =
      '/**\n * @title A code example\n *\n * Example description.\n */\nconst text = "```";';
    expect(parseExample(source, '01_example.ts')).toEqual({
      title: 'A code example',
      code: 'const text = "```";',
      markdown: 'Example description.\n\n````ts\nconst text = "```";\n````',
    });
  });

  it('retains example code without extracting it back out of Markdown fences', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ersc-site-docs-'));
    try {
      const code = 'const markdown = `\n```tsx\nconst nested = true;\n```\n`;';
      await Bun.write(join(root, '01_example.tsx'), `/** @title Nested fences */\n${code}`);
      const [entry] = await loadIndex(root);
      if (entry === undefined) {
        throw new Error('Missing example');
      }
      const page = await Effect.runPromise(
        readDocument(root, entry).pipe(Effect.provide(BunServices.layer)),
      );
      expect(page).toMatchObject({ code, markdown: expect.stringContaining('````tsx') });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails indexing on a broken prose link but ignores links inside code', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ersc-site-docs-'));
    try {
      await Bun.write(join(root, 'index.md'), '# Docs\n\n```md\n[Example](missing.md)\n```');
      await expect(loadIndex(root)).resolves.toHaveLength(1);
      await Bun.write(join(root, 'index.md'), '# Docs\n\n[Missing](missing.md)');
      await expect(loadIndex(root)).rejects.toThrow('Broken documentation link');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects source names that would collide after removing ordering prefixes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ersc-site-docs-'));
    try {
      await Bun.write(join(root, 'index.md'), '# Docs');
      await Bun.write(join(root, '01_example.ts'), 'const one = 1;');
      await Bun.write(join(root, '02_example.ts'), 'const two = 2;');
      await expect(loadIndex(root)).rejects.toThrow('Duplicate documentation URL');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
