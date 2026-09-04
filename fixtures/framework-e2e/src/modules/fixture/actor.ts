import { Context, Effect } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';

import { ERSC } from '@/ersc';

const ActorCookieName = 'fixture-actor';
const MaximumActorNameLength = 80;

export class CurrentActor extends Context.Service<CurrentActor, { readonly name: string | null }>()(
  '@effective-rsc/framework-e2e/fixture/CurrentActor',
) {}

const actorName = (request: HttpServerRequest.HttpServerRequest) => {
  const name = request.cookies[ActorCookieName]?.trim();
  return name === undefined || name === '' ? null : name.slice(0, MaximumActorNameLength);
};

const CurrentActorMiddleware = ERSC.Middleware.make<{ provides: CurrentActor }>(
  Effect.fnUntraced(function* (httpEffect) {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const response = yield* httpEffect.pipe(
      Effect.provideService(CurrentActor, { name: actorName(request) }),
    );
    return HttpServerResponse.setHeader(response, 'cache-control', 'private, no-store');
  }),
);

export const ActorERSC = ERSC.withMiddleware(CurrentActorMiddleware);
