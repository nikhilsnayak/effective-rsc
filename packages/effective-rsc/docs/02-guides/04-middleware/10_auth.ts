/**
 * @title Defining an authenticated view
 *
 * Middleware can short-circuit a request and provide typed services downstream.
 */
import { Context, Effect } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';
import { Application } from 'effective-rsc';

export class CurrentUser extends Context.Service<CurrentUser, { readonly name: string }>()(
  'docs/auth/CurrentUser',
) {}

export const ERSC = Application.ersc();

const RequireCurrentUser = ERSC.Middleware.make<{ provides: CurrentUser }>(
  Effect.fnUntraced(function* (httpEffect) {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const name = request.cookies['user']?.trim();
    if (name === undefined || name === '') {
      return HttpServerResponse.text('Unauthorized', { status: 401 });
    }
    return yield* httpEffect.pipe(Effect.provideService(CurrentUser, { name }));
  }),
);

export const AuthenticatedERSC = ERSC.withMiddleware(RequireCurrentUser);
