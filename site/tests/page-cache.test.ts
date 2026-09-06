/* oxlint-disable effecttsgo/async-function -- Exercise the native Web Request/Response boundary. */
import { Effect, Layer, Stream } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cachePublicPage } from '../src/page-cache';

const makeHandler = (response: HttpServerResponse.HttpServerResponse) =>
  HttpRouter.toWebHandler(
    Layer.mergeAll(
      Layer.mergeAll(
        HttpRouter.add('*', '/', Effect.succeed(response)),
        HttpRouter.add('*', '/docs', Effect.succeed(response)),
        HttpRouter.add('*', '/docs/getting-started/first-application', Effect.succeed(response)),
      ).pipe(Layer.provide(HttpRouter.middleware(cachePublicPage).layer)),
      HttpRouter.add('*', '/*', Effect.succeed(response)),
    ),
    { disableLogger: true },
  );

const pageResponse = () =>
  HttpServerResponse.text('page', {
    contentType: 'text/html',
    headers: {
      'cache-control': 'private, no-store',
      vary: 'Accept, Accept-Encoding',
      'content-location': 'https://site.test/docs',
    },
  });

afterEach(() => vi.unstubAllEnvs());

describe('deployment-scoped public page caching', () => {
  it.each([
    ['/', 'GET', 'text/html'],
    ['/docs', 'GET', 'text/html'],
    ['/docs', 'GET', 'text/x-component'],
    ['/docs', 'HEAD', 'text/html'],
    ['/docs', 'HEAD', 'text/x-component'],
    ['/docs?campaign=launch', 'GET', 'text/html'],
    ['/docs/getting-started/first-application', 'GET', 'text/html'],
  ])('caches %s %s %s without changing the representation', async (path, method, contentType) => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = makeHandler(
      HttpServerResponse.setHeader(pageResponse(), 'content-type', contentType),
    );
    try {
      const response = await app.handler(
        new Request(`https://site.test${path}`, { method, headers: { accept: contentType } }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
      expect(response.headers.get('vercel-cdn-cache-control')).toBe('public, max-age=31536000');
      expect(response.headers.get('vary')).toBe('Accept, Accept-Encoding');
      expect(response.headers.get('content-type')).toBe(contentType);
      expect(response.headers.get('content-location')).toBe('https://site.test/docs');
      expect(await response.text()).toBe(method === 'HEAD' ? '' : 'page');
    } finally {
      await app.dispose();
    }
  });

  it.each([
    { name: 'development', mode: 'development' },
    { name: 'test', mode: 'test' },
    { name: 'POST', method: 'POST' },
    { name: 'unknown document', path: '/docs/missing' },
    { name: 'other route', path: '/api/data' },
    { name: 'public asset', path: '/generated/logo.svg' },
    { name: '404', response: HttpServerResponse.setStatus(pageResponse(), 404) },
    { name: '500', response: HttpServerResponse.setStatus(pageResponse(), 500) },
    { name: 'redirect', response: HttpServerResponse.setStatus(pageResponse(), 302) },
  ])('does not opt $name into CDN caching', async (testCase) => {
    vi.stubEnv('NODE_ENV', testCase.mode ?? 'production');
    const app = makeHandler(testCase.response ?? pageResponse());
    try {
      const response = await app.handler(
        new Request(`https://site.test${testCase.path ?? '/docs'}`, {
          method: testCase.method ?? 'GET',
        }),
      );
      expect(response.headers.get('vercel-cdn-cache-control')).toBeNull();
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      await response.text();
    } finally {
      await app.dispose();
    }
  });

  it('does not vary the public page by browser-only preference cookies', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = makeHandler(pageResponse());
    try {
      const response = await app.handler(
        new Request('https://site.test/docs', { headers: { cookie: 'sidebar_state=false' } }),
      );
      expect(response.headers.get('vercel-cdn-cache-control')).toBe('public, max-age=31536000');
      expect(response.headers.get('vary')).toBe('Accept, Accept-Encoding');
      expect(await response.text()).toBe('page');
    } finally {
      await app.dispose();
    }
  });

  it('leaves native streaming incremental rather than buffering the response', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = makeHandler(
      HttpServerResponse.stream(
        Stream.make(new TextEncoder().encode('first')).pipe(Stream.concat(Stream.never)),
        { contentType: 'text/x-component', headers: { vary: 'Accept' } },
      ),
    );
    try {
      const response = await app.handler(new Request('https://site.test/docs'));
      expect(response.headers.get('vercel-cdn-cache-control')).toBe('public, max-age=31536000');
      const reader = response.body!.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toBe('first');
      await reader.cancel();
    } finally {
      await app.dispose();
    }
  });
});
