import { Effect } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';

import { AttendeeService } from '@/modules/attendee/service';

const SessionCookieName = 'gather-attendee-session';

export const AttendeeAccessHttpLayer = HttpRouter.use(
  Effect.fnUntraced(function* (router) {
    const service = yield* AttendeeService;

    yield* router.add(
      'GET',
      '/attendee/access/:token',
      Effect.gen(function* () {
        const params = yield* HttpRouter.params;
        const token = params['token'];
        if (token === undefined) {
          return HttpServerResponse.text('Magic-link token missing.', { status: 400 });
        }

        const outcome = yield* service.dashboard(token).pipe(
          Effect.as({ _tag: 'Authorized' } as const),
          Effect.catch((error) => Effect.succeed({ error, _tag: 'Rejected' } as const)),
        );
        if (outcome._tag === 'Rejected') {
          return HttpServerResponse.text(
            outcome.error._tag ===
              '@effective-rsc/example-event-platform/attendee/AttendeeAccessDenied'
              ? 'This attendee magic link is invalid or expired.'
              : 'The attendee hub is temporarily unavailable.',
            {
              status:
                outcome.error._tag ===
                '@effective-rsc/example-event-platform/attendee/AttendeeAccessDenied'
                  ? 401
                  : 503,
            },
          );
        }

        return HttpServerResponse.redirect('/attendee').pipe(
          HttpServerResponse.setCookieUnsafe(SessionCookieName, token, {
            httpOnly: true,
            path: '/',
            sameSite: 'lax',
          }),
        );
      }),
    );
  }),
);
