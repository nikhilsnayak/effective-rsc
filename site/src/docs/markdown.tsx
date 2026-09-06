import type { ReactNode } from 'react';

import { CodeBlock } from '../components/code-block';
import { resolveLink, type DocEntry, type DocPage } from './model';

export function Markdown({
  page,
  entries,
}: {
  readonly page: DocPage;
  readonly entries: ReadonlyArray<DocEntry>;
}) {
  return Bun.markdown.react(
    page.markdown,
    {
      a: function Link({ href, children }: { href: string; children: ReactNode }) {
        const resolvedHref = resolveLink(href, page.sourcePath, entries);
        return /^(?:https?:)?\/\//i.test(resolvedHref) ? (
          <a href={resolvedHref} target='_blank' rel='noopener noreferrer'>
            {children}
          </a>
        ) : (
          <a href={resolvedHref}>{children}</a>
        );
      },
      pre: function Code({ language = 'text', children }) {
        // Bun emits text chunks here; its JSX types currently describe them as elements.
        const code = children
          .map((chunk: unknown) => {
            if (typeof chunk !== 'string') {
              throw new TypeError('Expected Markdown code to contain only text.');
            }
            return chunk;
          })
          .join('');
        return (
          <CodeBlock
            code={code}
            language={language}
            variant='block'
            label={
              page.kind === 'Example' ? (page.sourcePath.split('/').at(-1) ?? language) : language
            }
          />
        );
      },
      table: function Table({ children }: { children: ReactNode }) {
        return (
          <div data-slot='table-container' className='overflow-x-auto'>
            <table>{children}</table>
          </div>
        );
      },
    },
    { headings: { ids: true }, noHtmlBlocks: true, noHtmlSpans: true },
  );
}
