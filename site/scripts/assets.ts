/* oxlint-disable effecttsgo/async-function, effecttsgo/node-builtin-import -- Build-time copying of public package assets. */
import { cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { BunServices } from '@effect/platform-bun';
import { Effect, Schema } from 'effect';

import { indexDocuments } from '../src/docs/files';
import { robotsTxt, sitemapXml } from '../src/seo';

const siteRoot = Bun.fileURLToPath(new URL('../', import.meta.url));
const decodeManifest = Schema.decodeUnknownSync(Schema.Struct({ name: Schema.String }));

const findFrameworkRoot = async (directory: string): Promise<string> => {
  const file = Bun.file(join(directory, 'package.json'));
  if (await file.exists()) {
    if (decodeManifest(await file.json()).name === 'effective-rsc') {
      return directory;
    }
  }
  const parent = dirname(directory);
  if (parent === directory) {
    throw new Error('Cannot locate the installed effective-rsc package.');
  }
  return findFrameworkRoot(parent);
};

const frameworkRoot = await findFrameworkRoot(dirname(Bun.resolveSync('effective-rsc', siteRoot)));
const copiedDocs = join(siteRoot, 'public/generated/docs');
// Replace the copied tree so removed documents cannot survive a rebuild.
await rm(copiedDocs, { recursive: true, force: true });
await cp(join(frameworkRoot, 'docs'), copiedDocs, { recursive: true });
const entries = await Effect.runPromise(
  indexDocuments(copiedDocs).pipe(Effect.provide(BunServices.layer)),
);
await Bun.write(
  join(siteRoot, 'public/sitemap.xml'),
  sitemapXml(['/', ...entries.map((entry) => entry.href)]),
);
await Bun.write(join(siteRoot, 'public/robots.txt'), robotsTxt);
for (const name of ['geist', 'geist-mono']) {
  const font = Bun.resolveSync(
    `@fontsource-variable/${name}/files/${name}-latin-wght-normal.woff2`,
    siteRoot,
  );
  await Bun.write(join(siteRoot, `public/generated/${name}.woff2`), Bun.file(font));
  const license = Bun.resolveSync(`@fontsource-variable/${name}/LICENSE`, siteRoot);
  await Bun.write(join(siteRoot, `public/generated/${name}-LICENSE.txt`), Bun.file(license));
}
for (const name of ['logo.svg', 'logo-dark.svg', 'LLMS.md']) {
  await Bun.write(join(siteRoot, 'public/generated', name), Bun.file(join(frameworkRoot, name)));
}
