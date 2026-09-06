import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CodeBlock } from '../src/components/code-block';
import { SidebarProvider } from '../src/components/ui/sidebar';
import { Markdown } from '../src/docs/markdown';
import type { DocPage } from '../src/docs/model';
import { DocsNavigation } from '../src/docs/navigation';
import { DocumentationPage } from '../src/docs/page';

describe('documentation rendering', () => {
  it('gives React one text value for page metadata', () => {
    const page: DocPage = {
      kind: 'Document',
      title: 'Getting started',
      section: 'Getting started',
      href: '/docs/getting-started',
      sourcePath: '01-getting-started/index.md',
      markdown: 'Hello.',
    };
    const html = renderToStaticMarkup(<DocumentationPage page={page} entries={[page]} />);
    expect(html).toContain('<title>Getting started · effective-rsc</title>');
  });
  it('renders code as escaped React text with server-side highlighting', () => {
    const html = renderToStaticMarkup(
      <CodeBlock
        code={'const html = "<script>bad()</script>";'}
        language='ts'
        label='example.ts'
        variant='block'
      />,
    );
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>bad()');
    expect(html).toContain('Copy code');
  });

  it('renders Markdown code chunks, links and heading anchors', () => {
    const page: DocPage = {
      kind: 'Document',
      title: 'Docs',
      section: 'Guides',
      href: '/docs',
      sourcePath: 'index.md',
      markdown: '## Usage\n\n[Usage](#usage)\n\n```ts\nconst value = 1;\n```',
    };
    const html = renderToStaticMarkup(<Markdown page={page} entries={[page]} />);
    expect(html).toContain('id="usage"');
    expect(html).toContain('href="/docs#usage"');
    expect(html).toContain('value');
    expect(html).not.toContain('[object Object]');
  });

  it('does not interpret authored HTML as executable markup', () => {
    const page: DocPage = {
      kind: 'Document',
      title: 'Docs',
      section: 'Guides',
      href: '/docs',
      sourcePath: 'index.md',
      markdown: '<script>bad()</script>',
    };
    expect(renderToStaticMarkup(<Markdown page={page} entries={[page]} />)).not.toContain(
      '<script>bad()',
    );
  });

  it('opens external websites in new tabs but keeps internal and email links unchanged', () => {
    const page: DocPage = {
      kind: 'Document',
      title: 'Docs',
      section: 'Docs',
      href: '/docs',
      sourcePath: 'index.md',
      markdown:
        '[HTTPS](https://example.com) [HTTP](http://example.com) [Relative](//example.com) [Internal](#usage) [Email](mailto:hello@example.com)',
    };
    const html = renderToStaticMarkup(<Markdown page={page} entries={[page]} />);
    for (const href of ['https://example.com', 'http://example.com', '//example.com']) {
      expect(html).toContain(`href="${href}" target="_blank" rel="noopener noreferrer"`);
    }
    expect(html).toContain('<a href="/docs#usage">Internal</a>');
    expect(html).toContain('<a href="mailto:hello@example.com">Email</a>');
  });

  it('server-renders all sections before the browser selects the active document', () => {
    const entries: Array<DocPage> = ['Getting started', 'Guides', 'Advanced', 'API reference'].map(
      (section, index) => ({
        kind: 'Document',
        title: section,
        section,
        href: `/docs/section-${index}`,
        sourcePath: `${index}/index.md`,
        markdown: '',
      }),
    );
    const html = renderToStaticMarkup(
      <SidebarProvider>
        <DocsNavigation entries={entries} />
      </SidebarProvider>,
    );
    for (const page of entries) {
      expect(html.split(`>${page.title}<`)).toHaveLength(2);
    }
    expect(html.match(/>Overview<\/a>/g)).toHaveLength(4);
    expect(html).not.toContain('aria-current="page"');
  });

  it('keeps executable snippets out of the sidebar', () => {
    const example: DocPage = {
      kind: 'Example',
      title: 'A minimal application',
      section: 'Getting started',
      href: '/docs/getting-started/first-application',
      sourcePath: '01-getting-started/01_first-application.tsx',
      markdown: '',
    };
    const overview: DocPage = {
      ...example,
      kind: 'Document',
      title: 'Getting started',
      href: '/docs/getting-started',
      sourcePath: '01-getting-started/index.md',
    };
    const html = renderToStaticMarkup(
      <SidebarProvider>
        <DocsNavigation entries={[overview, example]} />
      </SidebarProvider>,
    );
    expect(html).not.toContain('>Examples</h2>');
    expect(html).not.toContain(`href="${example.href}"`);
    expect(html).toContain(`href="${overview.href}"`);
  });
});
