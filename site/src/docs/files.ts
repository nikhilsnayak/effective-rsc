import { Effect, FileSystem, Path, Schema } from 'effect';

import { sourceToHref, resolveLink, type DocEntry, type DocPage } from './model';

export class DocumentationError extends Schema.TaggedError<DocumentationError>()(
  'DocumentationError',
  {
    message: Schema.String,
  },
) {}

export const parseExample = (source: string, fileName: string) => {
  const title = fileName
    .replace(/^\d+[-_]/, '')
    .replace(/\.[^.]+$/, '')
    .replaceAll(/[-_]/g, ' ');
  const comment = source.match(/^\/\*\*([\s\S]*?)\*\//);
  const lines = (comment?.[1] ?? '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, '').trimEnd());
  const heading = lines.find((line) => line.startsWith('@title '))?.slice(7) ?? title;
  const description = lines
    .filter((line) => !line.startsWith('@title '))
    .join('\n')
    .trim();
  const code = source.slice(comment?.[0].length ?? 0).trim();
  const fence = '`'.repeat(
    Math.max(3, ...Array.from(code.matchAll(/`+/g), (match) => match[0].length + 1)),
  );
  return {
    title: heading,
    code,
    markdown: `${description}\n\n${fence}${fileName.split('.').at(-1)}\n${code}\n${fence}`.trim(),
  };
};

export const readDocument = Effect.fn('readDocument')(function* (root: string, entry: DocEntry) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const text = yield* fs.readFileString(path.join(root, entry.sourcePath));
  const example =
    entry.kind === 'Example' ? parseExample(text, path.basename(entry.sourcePath)) : undefined;
  return {
    ...entry,
    code: example?.code,
    markdown:
      example?.markdown ??
      text
        .replace(/^#+ .+\r?\n/, '')
        .replace('<!-- source-navigation -->', '')
        .trim(),
  };
});

export const indexDocuments = Effect.fn('indexDocuments')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const files = yield* fs.readDirectory(root, { recursive: true });
  const sourcePaths = files.filter(
    (file) =>
      path.basename(file) === 'index.md' || (/\.tsx?$/.test(file) && !file.endsWith('.d.ts')),
  );
  // A directory's overview comes before its children, regardless of its filename.
  sourcePaths.sort((a, b) =>
    a.replace(/index\.md$/, '').localeCompare(b.replace(/index\.md$/, '')),
  );
  const pages: Array<DocPage> = [];
  for (const file of sourcePaths) {
    const sourcePath = file.replaceAll('\\', '/');
    const text = yield* fs.readFileString(path.join(root, file));
    const kind = sourcePath.endsWith('index.md') ? 'Document' : 'Example';
    const title =
      kind === 'Document'
        ? text.match(/^#+ (.+)$/m)?.[1]
        : parseExample(text, path.basename(file)).title;
    if (title === undefined) {
      return yield* new DocumentationError({
        message: `Missing documentation heading: ${sourcePath}`,
      });
    }
    const section = sourcePath.includes('/')
      ? (pages.find((page) => page.sourcePath === `${sourcePath.split('/')[0]}/index.md`)?.title ??
        title)
      : title;
    pages.push({
      kind,
      sourcePath,
      href: sourceToHref(sourcePath),
      title,
      section,
      markdown: kind === 'Example' ? parseExample(text, path.basename(file)).markdown : text,
    });
  }
  yield* Effect.try({
    try: () => {
      const hrefs = new Set<string>();
      for (const page of pages) {
        if (page.href.split('/').length > 5) {
          throw new Error(`Documentation exceeds the site's route depth: ${page.href}`);
        }
        if (hrefs.has(page.href)) {
          throw new Error(`Duplicate documentation URL: ${page.href}`);
        }
        hrefs.add(page.href);
        // Parse links so fenced code is not mistaken for prose.
        Bun.markdown.render(page.markdown, {
          link: (_, { href }) => resolveLink(href, page.sourcePath, pages),
        });
      }
    },
    catch: (cause) => new DocumentationError({ message: String(cause) }),
  });
  return pages.map(({ kind, sourcePath, href, title, section }) => ({
    kind,
    sourcePath,
    href,
    title,
    section,
  }));
});
