import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PageMetadata } from '../src/components/page-metadata';
import { documentDescription } from '../src/docs/description';
import { canonicalUrl, robotsTxt, sitemapXml, siteUrl } from '../src/seo';

describe('site metadata', () => {
  it('uses the production origin and drops query strings, fragments, and trailing slashes', () => {
    expect(canonicalUrl('/')).toBe(`${siteUrl}/`);
    expect(canonicalUrl('/docs/?utm_source=blog#intro')).toBe(`${siteUrl}/docs`);
    expect(canonicalUrl('https://preview.example/docs')).toBe(`${siteUrl}/docs`);
  });

  it('renders matching canonical and social metadata as escaped HTML', () => {
    const html = renderToStaticMarkup(
      <html lang='en'>
        <head>
          <PageMetadata
            title='Routes & layouts'
            description='Use <Layout> safely.'
            path='/docs/guides/routing'
          />
        </head>
        <body />
      </html>,
    );
    const head = html.split('</head>')[0];
    expect(head).toContain('<title>Routes &amp; layouts</title>');
    expect(head).toContain(`rel="canonical" href="${siteUrl}/docs/guides/routing"`);
    expect(head).toContain(`property="og:url" content="${siteUrl}/docs/guides/routing"`);
    expect(head).toContain('name="description" content="Use &lt;Layout&gt; safely."');
    expect(head).toContain(`property="og:image" content="${siteUrl}/social.png"`);
    expect(head).toContain('name="twitter:card" content="summary_large_image"');
    expect(head).toContain('property="og:image:width" content="1200"');
    expect(head).toContain('property="og:image:height" content="630"');
  });

  it('builds a canonical, deduplicated sitemap with XML-safe URLs and no invented dates', () => {
    const xml = sitemapXml(['/', '/docs', '/docs/', '/docs/a&b']);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.match(/<url>/g)).toHaveLength(3);
    expect(xml).toContain(`<loc>${siteUrl}/docs/a&amp;b</loc>`);
    expect(xml).not.toContain('lastmod');
    expect(robotsTxt).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
  });

  it('extracts prose without Markdown syntax, code, or HTML', () => {
    expect(
      documentDescription(
        '# Heading\n\n```ts\nconst hidden = true;\n```\n\nUse **services** and [`Layer`](https://effect.website)\nwith `Effect` & React.\n\nSecond paragraph.',
        'Services',
      ),
    ).toBe('Use services and Layer with Effect & React.');
    expect(
      documentDescription(
        '<!-- source-navigation -->\n\n<script>bad()</script>\n\nA useful guide.',
        'Guide',
      ),
    ).toBe('A useful guide.');
    expect(documentDescription('![Logo](/logo.svg)\n\nA useful guide.', 'Guide')).toBe(
      'A useful guide.',
    );
  });

  it('bounds descriptions and falls back when a document contains only code', () => {
    const description = documentDescription('Useful words '.repeat(30), 'Example');
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.endsWith('…')).toBe(true);
    expect(documentDescription('```ts\nconst value = 1;\n```', 'Example')).toBe(
      'Example in effective-rsc.',
    );
  });
});
