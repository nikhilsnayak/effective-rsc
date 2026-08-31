/**
 * @title Defining a middleware scope
 *
 * The handler receives the downstream response Effect. It may short-circuit or transform the
 * response, but introduces no typed failures.
 */
import { Effect } from 'effect';
import { HttpServerResponse } from 'effect/unstable/http';

import { ERSC } from './10_ersc';

export const ArticleResponsePolicy = ERSC.Middleware.make((httpEffect) =>
  Effect.map(httpEffect, HttpServerResponse.setHeader('cache-control', 'private, no-store')),
);

export const ArticleERSC = ERSC.withMiddleware(ArticleResponsePolicy);
