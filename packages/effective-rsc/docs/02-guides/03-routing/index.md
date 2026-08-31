## Routing, parameters, and loading

- Routes are immutable and belong to one ERSC identity.
- `page(path, page)` attaches a Page; `mount(prefix, routes)` nests a route scope.
- Mounted scopes retain their Layout and Loading ancestry.
- Page parameter Schemas decode Effect HTTP path captures before rendering.
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
