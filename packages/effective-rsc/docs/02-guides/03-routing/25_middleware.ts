/**
 * @title Defining inherited Page middleware
 *
 * The handler receives the downstream response Effect. It may short-circuit or transform the
 * response, but introduces no typed failures.
 */
import { Effect } from 'effect';
import { HttpServerResponse } from 'effect/unstable/http';

import { ERSC } from './10_ersc';

export const ArticleResponsePolicy = ERSC.Routes.middleware({
  handler: (httpEffect) =>
    Effect.map(httpEffect, HttpServerResponse.setHeader('cache-control', 'private, no-store')),
});
