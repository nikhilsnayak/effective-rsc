## Routing, parameters, and loading

Attach a Page with `routes.page(path, page)`. Group routes under a Layout and optional Loading
fallback, then nest them with `routes.mount(prefix, childRoutes)`. Each operation returns new Routes;
mounting preserves the child's layouts, loading fallbacks, and middleware.

Define path parameters in a Page's `params` Schema. Its encoded keys must match the route's
`:parameters` and accept strings; `render` receives decoded values. Mount prefixes cannot contain
parameters. Unmatched routes and rejected path parameters return `404`.

The root Routes needs a Layout containing the HTML document and at least one Page. A Loading
fallback is synchronous and renders below its Layout while descendants suspend.

<!-- source-navigation -->

### Examples

- [Create the ERSC identity](./10_ersc.ts)
- [Define Layout and Loading concerns](./10_layouts.tsx)
- [Define Pages](./20_pages.tsx)
- [Compose and mount Routes](./30_routes.tsx)
- [Compose the application](./40_application.ts)

### Related

- [Middleware](../04-middleware/index.md)
