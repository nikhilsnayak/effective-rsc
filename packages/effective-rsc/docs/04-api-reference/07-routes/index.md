## Routes

`ERSC.Routes.make({ layout?, loading? })` creates a route scope. Its methods return new Routes:

- `page(path, page)` adds a Page at an absolute Effect HTTP pattern. Parameter Schema keys must
  exactly match path parameters.
- `mount(prefix, childRoutes)` mounts non-empty Routes from the same application below an absolute,
  parameter-free prefix, retaining Layout, Loading, and middleware ancestry.

Conflicting matcher shapes and the `/_ersc` namespace are rejected. The root Routes must have a
Layout and at least one Page. Routes created from a `withMiddleware` view activate that middleware.

<!-- source-navigation -->

### Related

- [Middleware](../06-middleware/index.md)
