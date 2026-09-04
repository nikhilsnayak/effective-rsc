import { Context, Effect } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';

import { ERSC } from '@/ersc';

const OrganizerCookieName = 'gather-organizer';
const DefaultOrganizerId = 'user-nikhil';
const MaximumUserIdLength = 80;

export class CurrentOrganizer extends Context.Service<
  CurrentOrganizer,
  { readonly userId: string }
>()('@effective-rsc/example-event-platform/organizer/CurrentOrganizer') {}

const organizerId = (request: HttpServerRequest.HttpServerRequest) => {
  const userId = request.cookies[OrganizerCookieName]?.trim();
  return userId === undefined || userId === ''
    ? DefaultOrganizerId
    : userId.slice(0, MaximumUserIdLength);
};

const CurrentOrganizerMiddleware = ERSC.Middleware.make<{ provides: CurrentOrganizer }>(
  Effect.fnUntraced(function* (httpEffect) {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const response = yield* httpEffect.pipe(
      Effect.provideService(CurrentOrganizer, { userId: organizerId(request) }),
    );

    return HttpServerResponse.setHeader(response, 'cache-control', 'private, no-store');
  }),
);

export const OrganizerERSC = ERSC.withMiddleware(CurrentOrganizerMiddleware);
