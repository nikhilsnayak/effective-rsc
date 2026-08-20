import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const clientDistDir = join(import.meta.dirname, 'dist');
const serverDistDir = join(import.meta.dirname, 'dist/server');

// Load the server bundle
const serverBundle = await import(
  pathToFileURL(join(serverDistDir, 'index.js')).href
);

async function streamToString(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

async function streamToBuffer(stream) {
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// Get all static paths from the server bundle
const paths = serverBundle.getStaticPaths();
console.log(`Generating static pages for: ${paths.join(', ')}`);

for (const route of paths) {
  // Generate HTML page (includes CSS links and bootstrap scripts from RSC plugin)
  const htmlStream = await serverBundle.renderStaticPage(route);
  const html = await streamToString(htmlStream);

  const htmlPath = join(clientDistDir, `${route}.html`);
  mkdirSync(dirname(htmlPath), { recursive: true });
  writeFileSync(htmlPath, html);
  console.log(`  Generated: ${route}.html`);

  // Generate RSC payload for client-side navigation
  const rscStream = await serverBundle.renderStaticRsc(route);
  const rscPayload = await streamToBuffer(rscStream);

  const rscPath = join(clientDistDir, `${route}_.rsc`);
  writeFileSync(rscPath, rscPayload);
  console.log(`  Generated: ${route}_.rsc`);
}

console.log('Static generation complete!');
