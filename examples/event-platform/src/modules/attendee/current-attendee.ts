import { Context, Effect } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';

import { ERSC } from '@/ersc';

const AttendeeSessionCookie = 'gather-attendee-session';
const DefaultAttendeeSession = 'demo-attendee-ada';
const MaximumSessionTokenLength = 160;

export class CurrentAttendeeSession extends Context.Service<
  CurrentAttendeeSession,
  { readonly token: string }
>()('@effective-rsc/example-event-platform/attendee/CurrentAttendeeSession') {}

const sessionToken = (request: HttpServerRequest.HttpServerRequest) => {
  const token = request.cookies[AttendeeSessionCookie]?.trim();
  return token === undefined || token === ''
    ? DefaultAttendeeSession
    : token.slice(0, MaximumSessionTokenLength);
};

const CurrentAttendeeMiddleware = ERSC.Middleware.make<{ provides: CurrentAttendeeSession }>(
  Effect.fnUntraced(function* (httpEffect) {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const response = yield* httpEffect.pipe(
      Effect.provideService(CurrentAttendeeSession, { token: sessionToken(request) }),
    );

    return HttpServerResponse.setHeader(response, 'cache-control', 'private, no-store');
  }),
);

export const AttendeeHubERSC = ERSC.withMiddleware(CurrentAttendeeMiddleware);
