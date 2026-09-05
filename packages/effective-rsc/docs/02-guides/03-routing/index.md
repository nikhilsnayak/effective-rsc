## Routing, parameters, and loading

- Routes are immutable and belong to one ERSC identity.
- `page(path, page)` attaches a Page; `mount(prefix, routes)` nests a route scope.
- Mounted scopes retain their Layout and Loading ancestry.
- On GET/HEAD, the request handler decodes Page parameters once before rendering, with services
  from existing route middleware available. Rejected parameters return an empty `404`, including
  navigation Flight.
- Server Function POST refreshes keep parameter rejection in React's render-error path, preserving
  the completed action result.
- Effect HTTP owns route matching; ERSC rejects duplicate shapes and invalid composition while
  building the graph.

<!-- source-navigation -->

### Examples

- [Create the ERSC identity](./10_ersc.ts)
- [Define Layout and Loading concerns](./10_layouts.tsx)
- [Define Pages](./20_pages.tsx)
- [Compose and mount Routes](./30_routes.tsx)
- [Compose the application](./40_application.ts)

### Related

- [Middleware](../04-middleware/index.md)
