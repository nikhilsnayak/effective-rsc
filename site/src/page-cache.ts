import { Effect } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';

export const cachePublicPage = Effect.fnUntraced(function* <Error, Requirements>(
  httpEffect: Effect.Effect<HttpServerResponse.HttpServerResponse, Error, Requirements>,
) {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const response = yield* httpEffect;
  if (
    // oxlint-disable-next-line effecttsgo/process-env, effecttsgo/process-env-in-effect -- Rspack replaces this with the compile mode.
    process.env.NODE_ENV === 'production' &&
    (request.method === 'GET' || request.method === 'HEAD') &&
    response.status === 200
  ) {
    return HttpServerResponse.setHeaders(response, {
      'cache-control': 'public, max-age=0, must-revalidate',
      'vercel-cdn-cache-control': 'public, max-age=31536000',
    });
  }
  return response;
});
