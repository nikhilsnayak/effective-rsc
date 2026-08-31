import { Context, Effect } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';

import { ERSC } from '@/ersc';

const AttendeeCookieName = 'conference-attendee';
const MaximumAttendeeNameLength = 80;

export class CurrentAttendee extends Context.Service<
  CurrentAttendee,
  { readonly name: string | null }
>()('@effective-rsc/example-kitchen-sink/conference/CurrentAttendee') {}

const attendeeName = (request: HttpServerRequest.HttpServerRequest) => {
  const name = request.cookies[AttendeeCookieName]?.trim();
  return name === undefined || name === '' ? null : name.slice(0, MaximumAttendeeNameLength);
};

const CurrentAttendeeMiddleware = ERSC.Middleware.make<{ provides: CurrentAttendee }>(
  Effect.fnUntraced(function* (httpEffect) {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const response = yield* httpEffect.pipe(
      Effect.provideService(CurrentAttendee, { name: attendeeName(request) }),
    );
    return HttpServerResponse.setHeader(response, 'cache-control', 'private, no-store');
  }),
);

export const AttendeeERSC = ERSC.withMiddleware(CurrentAttendeeMiddleware);
