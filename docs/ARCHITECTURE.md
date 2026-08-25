# Architecture

This document describes the current implementation. Accepted future work is marked **Planned** in
[DECISIONS.md](DECISIONS.md); unresolved choices belong in
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

## Runtime graphs

```text
packages/effective-rsc/src/
  application/  public factories and application definition
  rsc/          browser/server Flight contracts
  client/       hydration and Navigation API runtime
  server/       HTTP, RSC, SSR, and request scope
  build/        Rspack lifecycle and compiled-server loading

examples/kitchen-sink/  application example and integration fixture
```

`effective-rsc` exposes one public root API. Its application, shared protocol, browser, server, and
build graphs remain explicit. Browser code does not import server or build entries, and only the RSC
graph resolves React's `react-server` condition.

The server owns HTTP negotiation, request scope, Flight rendering, HTML streaming, and Bun listening.
The client owns Flight decoding, document hydration, and navigation. The build graph owns application
compilation and compiled-server loading.

## Package and application builds

Rslib emits the framework as bundleless ESM, declarations, and source maps under
`packages/effective-rsc/dist/`. The package export, `ersc` executable, and private compiler entries
all execute that JavaScript; raw TypeScript is not a published entry point. Top-level RSC directives
and the source graph boundaries survive compilation.

`ersc build` runs a direct Rspack MultiCompiler with paired browser and server configurations. Rspack's
native RSC plugins assign RSC/SSR layers, produce client-reference data, and coordinate assets. Output
lives under `.ersc/client/` and `.ersc/server/`; the framework does not generate proxy source files.

A checked-in `'use server-entry'` module imports the application and its global stylesheet through
private aliases. Rspack supplies ordered JavaScript and stylesheet metadata to the compiled
application. Fizz receives scripts as bootstrap assets and stylesheets as React resources; assets are
not fields in the Flight model.

The browser build targets the Navigation API browser floor and enables the React Compiler. The server
build targets Bun's Node 26 compatibility and omits the React Compiler. React, React DOM, and RSDR use
one exact compatible release.

CSS stays in Rspack's native pipeline. `@tailwindcss/webpack` compiles Tailwind CSS v4 from the
application root; applications install `tailwindcss` explicitly. React hoists emitted stylesheets
into the document head.

## Application model

`Application.ersc<Services>()` creates one application-scoped ERSC authoring module. It owns a service
universe, runtime identity, and request-runner context. Feature modules use its factories, then
`ERSC.make({ routes, servicesLayer })` closes the module into the executable application exported from
`src/application.tsx`.

| Value       | Role                                                                                  |
| ----------- | ------------------------------------------------------------------------------------- |
| `Page`      | Effectful route leaf.                                                                 |
| `Layout`    | Effectful route wrapper with one `children` outlet; the root owns the document shell. |
| `Loading`   | Synchronous, service-free fallback directly below its Layout.                         |
| `Component` | Effectful Server Component that is not a route concern.                               |
| `ServerFn`  | Promise-shaped native React reference backed by a lazy Effect on the server.          |
| `Routes`    | Immutable route graph owned by the same ERSC identity as its concerns.                |

Each effectful operation infers its own requirements and must fit within `Services`. JSX erases nested
requirements, so the universe is declared once. `ERSC.make` receives a closed Layer for that universe;
service-free applications call `Application.ersc()`.

Every authored value carries its ERSC identity. Route composition rejects the wrong concern role or a
value from another ERSC instance. Server Functions retain that identity across native invocation and
execute only in the matching request runtime.

Each ERSC module owns an AsyncLocalStorage context for its request runner. Flight rendering binds one
FiberSet runner before React enters application code. Page, Layout, and Component operations retrieve
that runner without prop threading, while the FiberSet keeps their Effects attached to the HTTP
request lifetime.

## Routes and Flight model

`Routes.make` builds immutable route values. `page(path, Page)` adds a destination and
`mount(prefix, routes)` mounts a non-empty child graph from the same ERSC identity. Nested routes may
own Layout, Loading, both, or neither; the application root requires a Layout and at least one Page.

Composition rejects invalid path syntax, duplicate paths, empty mounts, invalid concern combinations,
and the reserved `/_ersc/assets` namespace. The current compiler registers authored exact paths
directly with Effect HTTP, with no second runtime matcher.

Compilation flattens each destination and its ordered Layout/Loading ancestry into a lookup table. A
mounted Routes value can appear under more than one prefix, so each destination owns its ancestry. A
lookup produces one unary tree:

```text
Layout -> optional Loading -> nested scope -> ... -> Page
```

Each Flight node contains an opaque React `id`, Server Component content, and an optional child. IDs
encode identity for reconciliation but are not parsed as protocol data. Every request still carries
one complete route tree; there is no partial patch transport.

## Initial document

```text
request
  -> Effect HTTP route and request scope
  -> RSC renders { routeTree, formState } as native Flight
  -> split Flight stream
       -> SSR decodes it and Fizz streams HTML
       -> embed the same Flight bytes in that HTML
  -> browser decodes the embedded payload and hydrates document
```

The browser makes no second initial Flight request and hydrates `document`, not a framework container.
Disconnecting cancels both stream branches and interrupts request-scoped Effects.

## Client navigation

```text
Navigation API event
  -> one React transition
  -> fetch one whole-tree Flight response
  -> await its root model while nested rows continue streaming
  -> retain the common Layout prefix and publish once
  -> commit destination Loading and URL together
  -> stream Page content into that boundary
```

The router uses `window.navigation` without a History API fallback. The Navigation API and
`NavigationPrecommitController` are mandatory. Native focus and scroll remain enabled, and closing
the browser Effect scope removes the listener.

`NavigateEvent.signal` owns an intercepted navigation through its exact Layout commit. The Flight
response owns a child Effect scope and remains alive while nested rows stream. A later navigation does
not automatically retire an earlier response after its handler has settled; that policy is deferred.

The browser retains only the currently revealed common Layout prefix. It has no route cache:
Back/Forward traversal, pushes, and replacements fetch whole trees. Server Function refresh replaces
the complete tree.

## Server Functions

React and RSDR own references, argument and form encoding, temporary references, form state, and
Flight. The framework adds Schema decoding, Effect execution, request lifetime, and whole-tree
refresh; it does not replace the native protocol with RPC.

| Form                                                                | Current state                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| Named `ERSC.ServerFn.make` imported and bound by a Client Component | Works after hydration.                                     |
| Named factory export bound by a Server Component                    | Blocked by missing Rspack server-layer action metadata.    |
| Inline native function with captured values                         | Blocked by the pinned Rspack/RSDR bound-argument mismatch. |

Request or protocol failures return non-2xx responses. After an invocation executes, the server
returns 200 Flight containing both the route refresh and an imperative `Success` or `Failure` result.
Request interruption remains interruption. Direct server invocation of an ERSC Server Function is
rejected rather than pretending its Effect is a Promise.

Pre-hydration progressive enhancement is not supported: the mutation executes, but the document
response does not currently complete before Bun times out.

## Effect and lifetime boundaries

- Use Effect for failures, resources, cancellation, concurrency, services, and lifetimes; keep pure
  transformations and incidental adapters plain.
- Cross-graph service contracts stay implementation-free. The owning runtime exports their live
  Layers.
- `Application.httpLayer` composes negotiation, assets, routes, renderers, and application services.
  `Application.layer` adds Bun listening.
- Rspack compilation is a scoped service owned by the CLI. Server modules do not start nested
  runtimes.
- `effect/unstable/http` owns HTTP lifecycles. `unstable/HttpApi` owns non-UI endpoints; React Server
  Functions own UI mutations.

## Command surface

- `ersc build` emits `.ersc/client/` and `.ersc/server/`.
- `ersc start` loads the compiled server once and listens on port `18193` with Bun.

There is no development command. D-041 through D-043 record the accepted but unimplemented dev-server
and HMR design.
