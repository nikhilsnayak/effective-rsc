## Middleware

Create middleware with `ERSC.Middleware.make(handler)`, then derive an authoring view with
`ERSC.withMiddleware(middleware)`. Routes and Server Functions created from that view run through
the middleware.

Declare request services with `ERSC.Middleware.make<{ provides: CurrentUser }>(handler)` and provide
them to the downstream Effect. Pages, Layouts, and Components created from the derived view can
require those services when rendered under its Routes or Server Functions. A derived view belongs
to the same application.

Chain `withMiddleware` in request order; responses unwind in reverse. For server-wide policy,
including assets and unmatched requests, register native global Effect HTTP middleware through the
application Layer.

<!-- source-navigation -->

### Examples

- [Define an authenticated view](./10_auth.ts)
- [Consume the service in a Page](./20_account-page.tsx)
- [Consume the service in a Server Function](./30_update-profile.ts)
- [Activate the scope with Routes](./40_application.tsx)
