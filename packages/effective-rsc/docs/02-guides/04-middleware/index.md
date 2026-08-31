## Middleware

Create middleware from the base ERSC view, then derive a view with
`ERSC.withMiddleware(middleware)`. The derived view has the same ERSC identity and retains the
middleware scope.

Routes and Server Functions created from the derived view activate that scope. Pages, Layouts, and
Components created from it may require the services declared by the middleware and consume them only
while rendered inside an active scope.

Use `ERSC.Middleware.make<{ provides: CurrentUser }>(handler)` when a middleware provides a
request-scoped service. The handler must provide that service to the downstream Effect. Chain
`withMiddleware` in request order; responses unwind in reverse.

Scoped middleware does not wrap userland HTTP, assets, or unmatched requests. Put server-wide policy
in native global Effect HTTP middleware supplied through the application Layer.

<!-- source-navigation -->

### Examples

- [Define an authenticated view](./10_auth.ts)
- [Consume the service in a Page](./20_account-page.tsx)
- [Consume the service in a Server Function](./30_update-profile.ts)
- [Activate the scope with Routes](./40_application.tsx)
