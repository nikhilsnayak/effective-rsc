/**
 * @title Composing application services and userland HTTP
 *
 * Native HTTP layers register on the same router when this Layer is passed to ERSC.make.
 */
import { Effect, Layer } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';

import { Catalog } from '../02-services/10_catalog';

const CatalogApi = HttpRouter.use(
  Effect.fnUntraced(function* (router) {
    const catalog = yield* Catalog;
    const featuredResponse = Effect.map(catalog.featured, HttpServerResponse.jsonUnsafe);

    yield* router.add('GET', '/api/catalog', featuredResponse);
  }),
);

const GlobalHeaders = HttpRouter.middleware(
  (httpEffect) =>
    Effect.map(httpEffect, HttpServerResponse.setHeader('x-content-type-options', 'nosniff')),
  { global: true },
);

export const ApplicationLayer = Layer.mergeAll(CatalogApi, GlobalHeaders).pipe(
  Layer.provideMerge(Catalog.layer),
);
