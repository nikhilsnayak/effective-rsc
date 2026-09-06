import { canonicalUrl, siteUrl } from '../seo';

export function PageMetadata({
  title,
  description,
  path,
}: {
  readonly title: string;
  readonly description: string;
  readonly path: string;
}) {
  const url = canonicalUrl(path);
  const image = `${siteUrl}/social.png`;
  return (
    <>
      <title>{title}</title>
      <meta name='description' content={description} />
      <link rel='canonical' href={url} />
      <meta property='og:type' content='website' />
      <meta property='og:site_name' content='effective-rsc' />
      <meta property='og:title' content={title} />
      <meta property='og:description' content={description} />
      <meta property='og:url' content={url} />
      <meta property='og:image' content={image} />
      <meta property='og:image:width' content='1200' />
      <meta property='og:image:height' content='630' />
      <meta
        property='og:image:alt'
        content='effective-rsc — React owns the UI. Effect owns the runtime.'
      />
      <meta name='twitter:card' content='summary_large_image' />
      <meta name='twitter:title' content={title} />
      <meta name='twitter:description' content={description} />
      <meta name='twitter:image' content={image} />
      <meta
        name='twitter:image:alt'
        content='effective-rsc — React owns the UI. Effect owns the runtime.'
      />
    </>
  );
}
