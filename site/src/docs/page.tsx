import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Fragment } from 'react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../components/ui/breadcrumb';
import { buttonVariants } from '../components/ui/button';
import { Separator } from '../components/ui/separator';
import { Markdown } from './markdown';
import type { DocEntry, DocPage } from './model';

export function DocumentationPage({
  page,
  entries,
}: {
  readonly page: DocPage;
  readonly entries: ReadonlyArray<DocEntry>;
}) {
  const documents = entries.filter((entry) => entry.kind === 'Document');
  const activeDocument =
    page.kind === 'Document'
      ? page
      : documents.find(
          (entry) =>
            entry.sourcePath ===
            `${page.sourcePath.slice(0, page.sourcePath.lastIndexOf('/') + 1)}index.md`,
        );
  const position = documents.findIndex((entry) => entry.href === activeDocument?.href);
  const previous = page.kind === 'Example' ? activeDocument : documents[position - 1];
  const next = page.kind === 'Example' ? undefined : documents[position + 1];
  const ancestors = documents.filter(
    (entry) => page.href === entry.href || page.href.startsWith(`${entry.href}/`),
  );
  const breadcrumbs = page.kind === 'Example' ? [...ancestors, page] : ancestors;
  return (
    <>
      <title>{`${page.title} · effective-rsc`}</title>
      <meta
        name='description'
        content={`${page.title}. Guides and executable examples for effective-rsc, the Effect-native React Server Components framework for Bun.`}
      />
      <div className='min-w-0 flex-1 pb-20 md:pt-10'>
        <article>
          <header className='mb-8'>
            <Breadcrumb className='mb-5'>
              <BreadcrumbList>
                {breadcrumbs.map((entry, index) => (
                  <Fragment key={entry.href}>
                    {index > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem>
                      {entry.href === page.href ? (
                        <BreadcrumbPage>
                          {entry.href === '/docs' ? 'Docs' : entry.title}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink href={entry.href}>
                          {entry.href === '/docs' ? 'Docs' : entry.title}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
            <h1 className='text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl'>
              {page.title}
            </h1>
          </header>
          <div className='typeset typeset-docs'>
            <Markdown page={page} entries={entries} />
          </div>
        </article>
        <Separator className='mt-12' />
        <nav className='mt-6 flex justify-between gap-4' aria-label='Previous and next pages'>
          {previous === undefined ? (
            <span />
          ) : (
            <a
              href={previous.href}
              className={buttonVariants({
                variant: 'ghost',
                className:
                  'h-auto max-w-1/2 flex-col items-start gap-2 px-2 py-3 text-left text-sm whitespace-normal',
              })}
            >
              <span className='text-muted-foreground flex items-center gap-2 text-xs'>
                <ArrowLeft size={14} aria-hidden='true' />
                {page.kind === 'Example' ? 'Back to documentation' : 'Previous'}
              </span>
              {previous.title}
            </a>
          )}
          {next !== undefined && (
            <a
              href={next.href}
              className={buttonVariants({
                variant: 'ghost',
                className:
                  'h-auto max-w-1/2 flex-col items-end gap-2 px-2 py-3 text-right text-sm whitespace-normal',
              })}
            >
              <span className='text-muted-foreground flex items-center gap-2 text-xs'>
                Next
                <ArrowRight size={14} aria-hidden='true' />
              </span>
              {next.title}
            </a>
          )}
        </nav>
      </div>
    </>
  );
}
