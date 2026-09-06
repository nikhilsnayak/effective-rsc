export const siteUrl = 'https://effective-rsc.nikhilsnayak.dev';
export const introductionUrl = 'https://www.nikhilsnayak.dev/blog/introducing-effective-rsc';

export const canonicalUrl = (path: string) => {
  const { pathname } = new URL(path, siteUrl);
  return `${siteUrl}${pathname.replace(/\/+$/, '') || '/'}`;
};

export const sitemapXml = (paths: ReadonlyArray<string>) => {
  const urls = [...new Set(paths.map(canonicalUrl))];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${Bun.escapeHTML(url)}</loc></url>`).join('\n')}
</urlset>
`;
};

export const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;
