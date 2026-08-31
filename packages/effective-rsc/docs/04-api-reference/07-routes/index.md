## Routes

`ERSC.Routes.make({ layout?, loading? })` creates an immutable route scope.

- `routes.page(path, page)` adds a Page at an absolute Effect HTTP pattern. Parameter Schema keys
  must exactly match path parameters.
- `routes.mount(prefix, childRoutes)` mounts a non-empty graph of the same ERSC identity below an
  absolute, parameter-free prefix.
- Mounted scopes retain their Layout, Loading, and middleware ancestry.

Both operations return new Routes values. Conflicting matcher shapes and `/_ersc/assets` are
rejected. Root Routes require a Layout and at least one Page.

Routes created from a derived authoring view activate its middleware.

<!-- source-navigation -->

### Related

- [Middleware](../06-middleware/index.md)
