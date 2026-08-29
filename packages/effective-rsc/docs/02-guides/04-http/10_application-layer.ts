/**
 * @title Composing application services and userland HTTP
 *
 * Native HTTP layers register on the same router when this Layer is passed to ERSC.make.
 */
import { Effect, Layer } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';

import { Catalog } from '../02-services/10_catalog';

const CatalogApi = HttpRouter.add(
  'GET',
  '/api/catalog',
  Effect.gen(function* () {
    const catalog = yield* Catalog;
    const featured = yield* catalog.featured;
    return HttpServerResponse.jsonUnsafe(featured);
  }),
).pipe(HttpRouter.provideRequest(Catalog.layer));

const GlobalHeaders = HttpRouter.middleware(
  (httpEffect) =>
    Effect.map(httpEffect, HttpServerResponse.setHeader('x-content-type-options', 'nosniff')),
  { global: true },
);

export const ApplicationLayer = Layer.mergeAll(Catalog.layer, CatalogApi, GlobalHeaders);
