# Authoring and route model

## ERSC identity

`Application.ersc<Services>()` creates one ERSC identity and its base authoring view. The identity
owns the declared service universe and render-runtime context. `ERSC.withMiddleware(middleware)`
creates a derived view of the same identity; it does not create another application.

`ERSC.make({ routes, layer })` closes the identity into the application exported from
`src/application.tsx`. The Layer is built once, shared by ERSC concerns and userland Effect HTTP,
and released when the server shuts down.

| Value        | Role                                                               |
| ------------ | ------------------------------------------------------------------ |
| `Page`       | Effectful route leaf with optional Schema-decoded path parameters. |
| `Layout`     | Effectful route wrapper; the root Layout owns the document shell.  |
| `Loading`    | Synchronous, service-free Suspense fallback below its Layout.      |
| `Component`  | Effectful Server Component that is not a route concern.            |
| `Middleware` | Same-identity adapter over Effect HTTP middleware.                 |
| `Routes`     | Immutable route graph that activates its retained middleware.      |
| `ServerFn`   | Native React Server Function backed by a lazy Effect.              |

Every authored value carries its ERSC identity. Composition rejects values from another identity or
values used in the wrong concern role. `Symbol.for` brands preserve identity checks across duplicate
framework module instances.

Page, Routes, and Application are opaque handles. Layout, Loading, Component, and ServerFn remain
callable because React consumes them directly. Internal accessors project runtime state without a
global registry.

## Render runtime

Each ERSC identity owns an AsyncLocalStorage context for its render runtime. Native Flight rendering
binds one request-owned FiberSet runner before React enters authored code. Page, Layout, and
Component Effects remain attached to the HTTP request.

Server Function handlers execute directly in the HTTP request fiber. If a Server Function refreshes
the current route, the refreshed Page, Layout, and Component Effects use the render runtime.

## Routes

`Routes.make` creates immutable scopes. `page(path, page)` adds an Effect HTTP pattern;
`mount(prefix, routes)` mounts a non-empty graph of the same ERSC identity. Mounted graphs retain
their Layout, Loading, and middleware ancestry.

Page paths own `:parameter` segments. Mount prefixes are parameter-free. ERSC validates canonical
paths, duplicate matcher shapes, concern identity, parameter Schema keys, and the reserved
`/_ersc/assets` namespace. Effect HTTP remains the only runtime matcher.

Compilation flattens the graph into destinations containing the Page, middleware, and
Layout/Loading ancestry. A graph may be mounted at several prefixes, so every destination owns its
complete ancestry. Rendering produces one unary tree:

```text
Layout -> optional Loading -> nested scope -> ... -> Page
```

Every request carries a complete route tree. React IDs preserve reconciliation identity but are not
parsed as ERSC protocol data.

## Middleware

Middleware is authored once and reused by Routes and Server Functions. A derived view permits Page,
Layout, Component, and ServerFn operations to require services declared by its middleware. Routes
and ServerFn activate the retained scope; render concerns consume it when rendered inside that
scope.

Ancestors run before descendants and responses unwind in reverse. Middleware already active for a
Server Function action does not run again during its route refresh; remaining route middleware wraps
the refresh. Native global Effect HTTP middleware remains separate and surrounds the whole router.

See the [Middleware guide](../../packages/effective-rsc/docs/02-guides/04-middleware/index.md) and
[API reference](../../packages/effective-rsc/docs/04-api-reference/06-middleware/index.md).

## Owners

- [`application/ersc.ts`](../../packages/effective-rsc/src/application/ersc.ts)
- [`application/route-graph.ts`](../../packages/effective-rsc/src/application/route-graph.ts)
- [`application/render-runtime.ts`](../../packages/effective-rsc/src/application/render-runtime.ts)
- [`server/flight-renderer.tsx`](../../packages/effective-rsc/src/server/flight-renderer.tsx)
