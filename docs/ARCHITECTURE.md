# Architecture

## Runtime graphs — Accepted

```text
packages/effective-rsc/src/
  application/  public factories and application definition
  rsc/          browser/server Flight contracts
  client/       hydration and Navigation API runtime
  server/       HTTP, RSC, SSR, and request scope
  build/        Rsbuild lifecycle and compiled-server loading

examples/kitchen-sink/  application example and integration fixture
```

`effective-rsc` is one package with one public root API. Its internal graphs keep application,
shared protocol, browser, server, and build dependencies explicit. Rsbuild, Rspack,
`react-server-dom-rspack` (RSDR), and Bun are fixed framework choices, not public adapters.

The server owns Flight rendering, Flight-to-HTML streaming, HTTP negotiation, assets, and the Bun
Layer. The client owns Flight decoding, document hydration, and navigation. The build graph owns the
fixed Rsbuild configuration across browser, RSC, and SSR environments; `rsbuild-plugin-rsc` owns the
native Rspack integration and SSR layer assignment.

## Application model — Accepted

Applications export one `Application.make({ routes, servicesLayer })` value from
`src/application.tsx`. Other paths have no routing semantics. Feature modules compose immutable
`Routes` values:

```tsx
// modules/schedule/routes.tsx
export const scheduleRoutes = Routes.make({
  layout: ScheduleLayout,
  loading: ScheduleLoading,
})
  .page('/', SaturdayPage)
  .page('/day-two', SundayPage);

// src/application.tsx
export default Application.make({
  routes: Routes.make({ layout: RootLayout })
    .page('/', HomePage)
    .mount('/schedule', scheduleRoutes),
  servicesLayer: ApplicationServices,
});
```

- `Routes.make()` creates an immutable collection. `page(path, Page)` adds an exact relative
  destination. `mount(prefix, routes)` prefixes a non-empty child and preserves its concerns. A
  child without Layout or Loading only groups paths.
- Nested Routes may own Layout, Loading, both, or neither. The application root requires a Layout;
  the graph requires at least one Page.
- `Page.make` converts an `Effect.fn` or `Effect.fnUntraced` operation into a Server Component.
  `Layout.make({ render })` does the same for an operation with one `children` outlet. The root
  Layout owns `<html>`, `<head>`, and `<body>`.
- `Loading.make` accepts a synchronous renderer. Its Suspense boundary sits directly below its
  Layout. A suspending Loading renderer is a development error; components may add native Suspense.
- ErrorBoundary and NotFound remain separate concern contracts. Non-UI routes belong to
  `unstable/HttpApi`, outside Routes.

Construction derives exact paths, nested concern ancestry, and required Page/Layout services from
the route graph. Rules that hold for a single Routes value are rejected as it is composed: invalid
path syntax, duplicate paths, and empty mounts. Rules that need root context are rejected when the
application compiles the graph: a missing root Layout, a graph with no Page, invalid concern
combinations, and the reserved `/_ersc/assets` namespace. Mounting prepends a prefix, so a relative
path cannot be judged against that namespace before the root is known. Dynamic parameters and their
Effect Schema API remain open.

If Page or Layout requires services, `servicesLayer` must provide the complete inferred union with
no remaining requirements. Service-free applications omit it. `Application.httpLayer` installs the
application and renderer Layers into each request; `Application.layer` adds the Bun listener.
Layer errors retain their typed channel.

Factories use private shared machinery but expose no generic segment API. Page, Layout, and Loading
are branded, Layout and Page share the request Effect runtime, and service requirements survive
mount composition. Named parallel Slots are deferred and must preserve nested Layout ownership.

## Route compilation — Working

The composed Routes value is both the route graph and the source of the static bundler graph. The
compiler does not discover routes from files or reconstruct them from a manifest.

A checked-in framework RSC entry owns `'use server-entry'`, imports the fixed application, and
exports its definition. Private aliases resolve that application and `src/styles.css`; applications
cannot import or configure them. Rspack adds ordered `entryJsFiles` and `entryCssFiles` metadata to
the compiled application. The loader validates both lists. Fizz receives scripts as bootstrap
assets and stylesheets as React resources; assets are not Flight-model fields.

The compiler uses real framework modules rather than generated proxy entries. Browser output lives
in `.ersc/client/`, the Bun bundle in `.ersc/server/`, and no process shares generated source files.

Compiling the route graph flattens each exact Page path and its ordered Layout/Loading ancestry into
one destination table, exposing the path list and a per-destination lookup. An immutable Routes value
may be mounted at more than one prefix, so the authored graph is a DAG and each destination carries
its own ancestry. Each path registers directly with Effect HTTP; request dispatch adds no second
matcher. A lookup builds one unary tree:

```text
Layout -> optional Loading -> nested scope -> ... -> Page
```

`RouteOutlet` renders the single child, keyed by its `id`. Each node contains only `id`, Server
Component `content`, and optional `child`. Layout IDs are mount prefixes; Loading and Page IDs are
destination pathnames. IDs are local React identities, not parsed protocol data. Layout and Page
content remain independent Flight values, avoiding a server-call waterfall.

On cross-destination navigation, the browser retains content for the matching Layout prefix while
the retained `RouteOutlet` reads the destination child. The new Loading and Page mount beneath the
revealed Layout, so persistent UI stays mounted and the destination fallback can commit before Page
content arrives. Server Function refresh replaces the complete tree.

Every request still returns one complete unary Flight tree. There is no partial patch model. Unknown
paths keep Effect HTTP's empty `404`; dynamic matching remains deferred.

## Initial document request — Accepted

```text
request
  -> Effect HTTP exact-path route and request scope
  -> RSC renders { routeTree, formState } as native Flight
  -> split Flight stream
       -> SSR decodes it and Fizz streams HTML
       -> embed the same Flight bytes in that HTML
  -> browser decodes the embedded payload and hydrates document
```

The browser makes no second initial Flight request. The route tree owns the complete document, so
React hydrates `document`, not a framework container. Disconnecting cancels both stream branches and
interrupts request-scoped Effects.

## Client navigation — Working

```text
Navigation API event
  -> one React transition for the navigation Action
  -> fetch one whole-tree Flight response
  -> await only its root model; nested rows continue streaming
  -> retain the revealed common Layout prefix and publish once
  -> commit destination Loading and URL together
  -> stream Page content into that boundary
```

The router listens to `window.navigation`; it does not patch anchors or History API. It ignores
non-interceptable destinations, hashes, downloads, forms, reloads, and React's
`info: "react-transition"` events. Cancelable navigation uses `precommitHandler`; browser-mandated
non-cancelable traversal uses the post-commit `handler`. Native focus and scroll remain enabled.
Closing the browser Effect scope removes the listener.

`NavigateEvent.signal` owns ordering. Supersession interrupts the Flight request and exact commit
wait through the browser Effect runtime; there is no revision counter or router queue. The request
starts synchronously inside the single transition. No second transition or intermediate canonical
state is introduced.

After the Flight root resolves, `BrowserRoot` performs one state update. For a different Page, it
retains the current common Layout content while using the destination nodes and children. A native
commit promise belongs to that navigation; only its resolver enters React, and `useLayoutEffect`
resolves it after the exact tree commits. The browser then commits URL, history, UI, scroll, and any
View Transition together. A global pending flag is not a commit token.

The Flight loader requires a successful `text/x-component` response and decodes it with native
RSDR. Each response owns a child Effect scope. EOF, failure, cancellation, or browser shutdown closes
that scope. RSDR consumes eagerly, so nested rows keep streaming after the root model resolves. A
successful commit leaves the stream to self-finalize; abandonment invokes an idempotent release.

There is no route cache: every push, replace, and traversal fetches a whole tree. Retaining the one
currently revealed Layout prefix is reconciliation, not a reusable route entry. Back/Forward reuse,
prefetching, eviction, invalidation, Activity, and partial responses remain one later design.

## Server Functions — Working

React and RSDR own references, argument/form encoding, temporary references, form state, and Flight.
The framework adds the Effect execution boundary and whole-tree refresh; RPC does not replace this
path.

| Authoring form                                                 | State                                                                                                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Named `ServerFn.make` imported and bound by a Client Component | Hydrated calls work.                                                                                                                     |
| Named factory export bound by a Server Component               | Blocked: Rspack omits it from server-layer action metadata; awaiting [rspack#15298](https://github.com/web-infra-dev/rspack/pull/15298). |
| Inline native function with compiler-captured values           | Blocked: pinned Rspack and RSDR disagree on bound-argument helper exports.                                                               |

Local alias or export-shape workarounds are excluded because they do not prove the native contract.

The server decodes the native request, loads its reference, runs the result in the HTTP request,
rerenders the route, and returns Flight containing the refresh and imperative result. The browser
uses a scoped `FiberSet.makeRuntimePromise` runner at RSDR's Promise callback. It returns the
imperative result without awaiting React commit, which would deadlock action completion; the commit
wait runs in the captured browser scope. Failure cancels the response, success lets its eager reader
self-finalize, and browser shutdown closes pending work.

Before hydration, the mutation executes but the full-document response does not complete before Bun
times out. Its Playwright test remains `fixme`, so progressive enhancement is not yet supported.

Remaining bridge gaps:

- `ServerFn.make` is typed as Promise-returning but its server implementation returns an Effect
  behind a cast. Direct and nested server invocation therefore lack an honest async contract.
- `Application.make` does not include ServerFn-only services in its inferred union.
- Native Promises are cancellable only when they observe an abort signal; rejection must cross
  `Effect.tryPromise`, and interruption-only causes need distinct classification.
- Decoded argument counts need a limit, and concurrent responses need an explicit ordering policy.
- The provisional `serverFnResult` proves a refresh and imperative value can share Flight; its final
  success/failure representation is open.

## Effect boundaries — Accepted

- Use Effect where failures, resources, cancellation, concurrency, services, or lifetimes matter;
  keep pure transformations and incidental adapters plain.
- Renderer capabilities are `Context.Service` classes. A service owns `make` and
  `Layer.effect(this, this.make)` when contract and implementation share a graph. Cross-graph
  contracts stay implementation-free; the owning runtime exports the live `*Layer`. `HtmlRenderer`
  is shared, while its live Layer remains SSR-owned.
- `Application.httpLayer` is the request-composition boundary for negotiation, assets, routes,
  renderers, and application services. `Application.layer` adds Bun listening. Both require only
  `ServerConfig`.
- Rsbuild compilation is a scoped service; the CLI owns its release and is the only process runtime
  owner. Server modules do not start nested runtimes.
- `effect/unstable/http` owns HTTP lifecycles. `unstable/HttpApi` owns non-UI endpoints. React Server
  Functions own UI mutations. Future RPC is limited to work that does not imply RSC refresh.

## Build environments — Accepted

Rsbuild coordinates distinct Rspack browser, RSC, and SSR graphs. Only the RSC graph receives
React's `react-server` condition; native client references remain graph-correct. React, React DOM,
and RSDR use one exact compatible Canary release. The browser root runs in Strict Mode, and
Rsbuild's React plugin enables Rspack's built-in React Compiler in development and production.

Tailwind v4 is the only integrated styling toolchain. Applications own `src/styles.css`, starting
with `@import 'tailwindcss'`; the framework owns its Rsbuild plugin. Plain CSS and CSS Modules use
Rsbuild directly. The server entry owns all reachable asset metadata, and React hoists stylesheet
resources into the document head.

Applications depend on React, React DOM, Effect, and RSDR; the framework declares exact peer
versions. RSDR is a protocol peer, not an authoring API. Framework-only compiler and platform
adapters remain ordinary dependencies.

The `effect/unstable/cli`-based CLI owns commands and platform services:

- `ersc build` emits `.ersc/client/` and `.ersc/server/`.
- `ersc dev` serves port `18193`, in-memory assets, HMR, diagnostics, and the current Effect HTTP
  handler. Successful server rebuilds swap handlers and close the previous Layer scope.
- `ersc start` loads the production bundle once and serves port `18193` with Bun.

Bun owns package management, builds, development, and production. Vitest and `@effect/vitest` run
unit tests in Node; integration tests launch the built application under Bun. This does not make
Node an application runtime adapter.
