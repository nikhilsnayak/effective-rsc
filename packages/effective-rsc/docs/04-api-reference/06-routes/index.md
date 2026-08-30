## Routes

`ERSC.Routes.make({ layout?, loading?, middleware? })` creates an immutable scope.

- `ERSC.Routes.middleware({ handler })` creates middleware for the current ERSC instance. `handler`
  receives the downstream HTTP response Effect and must not introduce typed failures. Composition
  follows native Effect `HttpRouter.Middleware` semantics.
- `middleware` is a non-empty ordered list. Request handling is top to bottom; response transforms
  unwind bottom to top. Ancestor middleware runs before descendant middleware. Duplicate middleware
  in a resolved chain is rejected.
- Routes middleware wraps matched Page GET and native HEAD fallback only. It does not wrap Server
  Function POST, userland HTTP, assets, or unmatched paths.
- `routes.page(path, page)` adds a Page at an absolute Effect HTTP pattern. Parameter Schema keys must
  exactly match the path parameters.
- `routes.mount(prefix, childRoutes)` mounts a non-empty same-ERSC graph below an absolute,
  parameter-free prefix.

Both operations return new Routes values. Conflicting shapes and `/_ersc/assets` are rejected.
Root Routes require a Layout and at least one Page.
