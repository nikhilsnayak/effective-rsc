## Routes

`ERSC.Routes.make({ layout?, loading? })` creates an immutable scope.

- Create middleware with `ERSC.Middleware.make(handler)`, then call
  `ERSC.withMiddleware(middleware)`. Routes created from the returned view activate that scope for
  matched Page GET and native HEAD fallback.
- Pass `{ provides: Service }` as the type argument to `make` when the handler provides a request
  service. Use `{ provides: FirstService | SecondService }` for multiple services. Page, Layout,
  Component, ServerFn, Routes, Middleware, `withMiddleware`, and `make` remain available on the
  derived view.
- Chain `withMiddleware` in request order. Responses unwind in reverse order. Shared prefixes across
  mounted scopes run once.
- Scoped middleware does not wrap userland HTTP, assets, or unmatched paths. Use native global
  Effect HTTP middleware for server-wide policy.
- `routes.page(path, page)` adds a Page at an absolute Effect HTTP pattern. Parameter Schema keys must
  exactly match the path parameters.
- `routes.mount(prefix, childRoutes)` mounts a non-empty same-ERSC graph below an absolute,
  parameter-free prefix.

Both operations return new Routes values. Conflicting shapes and `/_ersc/assets` are rejected.
Root Routes require a Layout and at least one Page.
