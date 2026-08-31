## Routing, parameters, and loading

- Routes are immutable and belong to one ERSC instance.
- `page(path, page)` attaches a Page; `mount(prefix, routes)` nests a route scope.
- Mounted scopes retain their Layout, Loading, and middleware ancestry.
- `ERSC.withMiddleware(middleware)` returns a derived authoring view. Its Routes activate that scope
  for Page GET/HEAD; its Server Functions activate it for their POST.
- `ERSC.Middleware.make<{ provides: CurrentUser }>(handler)` makes `CurrentUser` available to every
  factory on the derived view. The handler must provide it to the downstream Effect. Use a union
  when one middleware provides multiple services.
- A Page, Layout, or Component may render only where every middleware captured by its authoring view
  is active. A Server Function activates its own captured scope.
- Chain `withMiddleware` in request order. Responses unwind in reverse order.
- Native Effect HTTP global middleware remains the server-wide policy mechanism.
