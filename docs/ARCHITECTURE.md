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

ERSC is an application-scoped authoring and execution module. It declares one Effect
service-contract universe, owns one runtime identity and one request-runtime context for its
Effect runner, and creates React concerns, Components, Server Functions, and Routes belonging to
that same module. It is not a service implementation, dependency container, RSC transport, or
individual Server Component.

`Application.ersc<Services>()` constructs an open ERSC module without choosing implementations.
Feature modules use it to author the application. `ERSC.make({ routes, servicesLayer })` closes that
module with its route graph and service Layer, producing the executable application exported from
`src/application.tsx`. Other paths have no routing semantics:

```text
Application.ersc<Services>()
  -> open ERSC module
  -> author Page, Layout, Component, Loading, ServerFn, and Routes values
  -> ERSC.make({ routes, servicesLayer })
  -> closed executable application
```

Feature modules import that ERSC module and compose immutable Routes values:

```tsx
// modules/schedule/routes.tsx
import { ERSC } from '@/ersc';

export const SaturdayPage = ERSC.Page.make({
  render: Effect.fn('SaturdayPage')(function* () {
    const schedule = yield* ScheduleRepository;
    return <Schedule schedule={yield* schedule.saturday} />;
  }),
});

export const scheduleRoutes = ERSC.Routes.make({
  layout: ScheduleLayout,
  loading: ScheduleLoading,
})
  .page('/', SaturdayPage)
  .page('/day-two', SundayPage);

// src/ersc.ts
export type AppServices = ScheduleRepository | SpeakerRepository;
export const ERSC = Application.ersc<AppServices>();

// src/application.tsx
export default ERSC.make({
  routes: ERSC.Routes.make({ layout: RootLayout })
    .page('/', HomePage)
    .mount('/schedule', scheduleRoutes),
  servicesLayer: ApplicationLive,
});
```

- `ERSC.Routes.make()` creates an immutable collection owned by the same ERSC identity as its Page,
  Layout, and Loading concerns. `page(path, Page)` adds an exact relative destination. `mount(prefix,
routes)` prefixes a non-empty child from that ERSC identity. A child without Layout or Loading
  only groups paths.
- Nested Routes may own Layout, Loading, both, or neither. The application root requires a Layout;
  the graph requires at least one Page.
- `ERSC.Page.make`, `ERSC.Layout.make`, and `ERSC.Component.make` accept `{ render }` and convert
  `Effect.fn` or
  `Effect.fnUntraced` operations into Server Components. Page, Layout, intermediate, and leaf
  components therefore use one authoring model. Layout has one `children` outlet, and the root
  Layout owns `<html>`, `<head>`, and `<body>`. `Layout.make` infers the fixed `children` input,
  including for an operation wrapped by `Effect.fn`; applications do not import a framework props
  type.
- `ERSC.ServerFn.make` validates Schema decoding and handler requirements against the same declared
  service universe while keeping the exported reference Promise-shaped for native React clients.
- `ERSC.Loading.make` accepts `{ render }` with a synchronous, service-free renderer and attaches
  the same ERSC identity as its Routes. Promise and Effect renderers are rejected at the type
  boundary. Its Suspense boundary sits directly below its Layout. A renderer that suspends
  internally is a development error; components may add native Suspense.
- ErrorBoundary and NotFound remain separate concern contracts. Non-UI routes belong to
  `unstable/HttpApi`, outside Routes.

Construction derives exact paths and nested concern ancestry from the route graph. Rules that hold
for a single Routes value are rejected as it is composed: invalid path syntax, duplicate paths, and
empty mounts. Rules that need root context are rejected when the application compiles the graph: a
missing root Layout, a graph with no Page, invalid concern combinations, and the reserved
`/_ersc/assets` namespace. Mounting prepends a prefix, so a relative path cannot be judged against
that namespace before the root is known. Dynamic parameters and their Effect Schema API remain
open.

`Services` is the module's maximum capability universe, not a concrete implementation and not a
requirement that every member use every service. Every effectful ERSC operation infers its own
requirements and must fit within that universe. Declaring the universe once is necessary because
ordinary JSX erases the requirements of nested components to `JSX.Element`. Service-free
applications call `Application.ersc()`. `ERSC.make` requires a closed `servicesLayer` for the
universe and preserves its typed error channel. `Application.httpLayer` installs that Layer and the
renderer Layers into each request; `Application.layer` adds the Bun listener.

Every authored value carries the ERSC identity. Where composition is inspectable, the framework
rejects both the wrong concern role and values from another identity immediately. Components
enforce ownership through their ERSC-scoped request-runtime context because arbitrary JSX cannot be
inspected during route composition.
Server Functions carry the identity across their server invocation and execute only through the
matching application request runtime. Two ERSC modules are therefore not interchangeable merely
because they declare structurally identical service types or later receive compatible Layers.

Each application-scoped ERSC module owns an AsyncLocalStorage context for its Effect runner. The
Flight renderer binds the request's FiberSet runner once while entering native RSDR rendering.
Page, Layout, and Component concerns all retrieve that runner through the same context and suspend
their authored render operation inside it without prop threading or concern-specific setup.
AsyncLocalStorage only propagates the runner across React's asynchronous render work; the runner's
FiberSet owns execution and keeps every descendant Effect attached to the HTTP request lifetime.
Factories use private shared machinery but expose no generic route-concern factory. Page, Layout,
and Loading are branded and Routes validates those roles at runtime; Component is not a route
concern. Named parallel Slots are deferred and must preserve nested Layout ownership.

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
Component `content`, and optional `child`. IDs are opaque, role-qualified local React identities.
Layout and Loading IDs include the authored Routes scope and its mounted prefix; Loading and Page
IDs also include the destination pathname. Distinct concerns can therefore share a pathname without
becoming retainable. IDs are not parsed protocol data. Layout and Page content remain independent
Flight values, avoiding a server-call waterfall.

On cross-destination navigation, the browser retains content only for matching authored Layout
scopes while the retained `RouteOutlet` reads the destination child. The new Loading and Page mount
beneath the revealed Layout, so persistent UI stays mounted and the destination fallback can commit
before Page content arrives. Server Function refresh replaces the complete tree.

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

`NavigateEvent.signal` owns the intercepted navigation only until its handler settles. It orders the
Flight root and exact commit wait through the browser Effect runtime; there is no revision counter or
router queue. The request starts synchronously inside the single transition. No second transition or
intermediate canonical state is introduced.

After the Flight root resolves, `BrowserRoot` performs one state update. For a different Page, it
retains the current common Layout content while using the destination nodes and children.
`BrowserRoot.render` privately creates and returns the native commit promise; only its resolver
enters React, and `useLayoutEffect` resolves it after the exact tree commits. The browser then
commits URL, history, UI, scroll, and any View Transition together. A global pending flag is not a
commit token.

The Flight loader requires a successful `text/x-component` response and decodes it with native
RSDR. Each response owns a child Effect scope. RSDR consumes eagerly, so nested rows keep streaming
after the root model resolves. Once that root commits and the Navigation API handler settles, a
later navigation does not abort the earlier event signal; both responses may continue to EOF. The
reference routers likewise do not establish retirement of ordinary post-commit Flight streams.
Explicit ownership and retirement of a committed-but-still-streaming response is deferred while the
framework concentrates on ERSC authoring and execution.

There is no route cache: every push, replace, and traversal fetches a whole tree. Retaining the one
currently revealed Layout prefix is reconciliation, not a reusable route entry. Back/Forward reuse,
prefetching, eviction, invalidation, Activity, and partial responses remain one later design.

## Server Functions — Working

React and RSDR own references, argument/form encoding, temporary references, form state, and Flight.
The framework adds the Effect execution boundary and whole-tree refresh; RPC does not replace this
path.

| Authoring form                                                      | State                                                                                                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Named `ERSC.ServerFn.make` imported and bound by a Client Component | Hydrated calls work.                                                                                                                     |
| Named factory export bound by a Server Component                    | Blocked: Rspack omits it from server-layer action metadata; awaiting [rspack#15298](https://github.com/web-infra-dev/rspack/pull/15298). |
| Inline native function with compiler-captured values                | Blocked: pinned Rspack and RSDR disagree on bound-argument helper exports.                                                               |

Local alias or export-shape workarounds are excluded because they do not prove the native contract.

The server decodes the native request, loads its reference, runs the result in the HTTP request,
rerenders the route, and returns Flight containing the refresh and imperative result. Request and
protocol failures use non-2xx HTTP responses. Once a client invocation executes, its `Success` or
`Failure` result returns in 200 Flight so the browser can decode the result and refresh together;
request interruption remains interruption. The browser uses a scoped
`FiberSet.makeRuntimePromise` runner at RSDR's Promise callback. It returns the imperative result
without awaiting React commit, which would deadlock action completion; the commit wait runs in the
captured browser scope. Transport or commit-wait failure releases the response, successful decoding
lets its eager reader self-finalize, and browser shutdown closes pending work.

`ERSC.ServerFn.make` is a framework intrinsic. Its exported callable has a real Promise contract for
the client graph. In the server graph it produces an ERSC-branded invocation carrying the lazy
Effect; the matching application request runtime validates the brand and executes that Effect.
Direct server invocation rejects instead of pretending that an Effect is a Promise. ServerFn-only
requirements are checked against the ERSC service universe and are supplied by the Layer chosen at
`ERSC.make`.

Before hydration, the mutation executes but the full-document response does not complete before Bun
times out. Its Playwright test remains `fixme`, so progressive enhancement is not yet supported.

Remaining bridge gaps:

- RSDR limits decoded client argument-array size. Raw request bodies still need a limit, and
  concurrent responses need an explicit ordering policy.
- Expected Effect errors, defects, and serializable client failure values need an end-to-end typed
  mapping.

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
Rsbuild's React plugin enables Rspack's built-in React Compiler for the browser environment in
development and production. The server environment omits it: `react/compiler-runtime` has no
`react-server` variant, so a memoized Server Component would call `useMemoCache` against a hooks
dispatcher the `react-server` build does not expose. Memoization also earns nothing in a single
server render pass.

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
