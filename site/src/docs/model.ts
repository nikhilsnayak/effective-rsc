import { Schema } from 'effect';

export const DocEntry = Schema.Struct({
  kind: Schema.Literals(['Document', 'Example']),
  href: Schema.String,
  sourcePath: Schema.String,
  title: Schema.String,
  section: Schema.String,
});
export type DocEntry = typeof DocEntry.Type;
export const DocPage = Schema.Struct({ ...DocEntry.fields, markdown: Schema.String });
export type DocPage = typeof DocPage.Type;

export const sourceToHref = (sourcePath: string) => {
  const slug = sourcePath
    .replace(/(^|\/)\d+[-_]/g, '$1')
    .replace(/(^|\/)index\.md$/, '')
    .replace(/\.(?:md|tsx?)$/, '')
    .replace(/\/$/, '');
  return slug === '' ? '/docs' : `/docs/${slug}`;
};

// Resolve against the package file, not the website URL: source links include numeric prefixes.
export const resolveLink = (
  href: string,
  sourcePath: string,
  entries: ReadonlyArray<DocEntry>,
): string => {
  const url = new URL(href, `https://docs.invalid/${sourcePath}`);
  if (url.origin !== 'https://docs.invalid') {
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? href : '#';
  }
  const entry = entries.find(
    (candidate) => candidate.sourcePath === decodeURIComponent(url.pathname.slice(1)),
  );
  if (entry === undefined) {
    throw new Error(`Broken documentation link in ${sourcePath}: ${href}`);
  }
  return `${entry.href}${url.search}${url.hash}`;
};
