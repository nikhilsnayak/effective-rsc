## Routes

`ERSC.Routes.make({ layout?, loading? })` creates an immutable scope.

- `routes.page(path, page)` adds a Page at an absolute Effect HTTP pattern. Parameter Schema keys must
  exactly match the path parameters.
- `routes.mount(prefix, childRoutes)` mounts a non-empty same-ERSC graph below an absolute,
  parameter-free prefix.

Both operations return new Routes values. Conflicting shapes and `/_ersc/assets` are rejected.
