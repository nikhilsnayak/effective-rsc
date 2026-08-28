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

`effective-rsc` exposes one public root API under the `react-server` export condition. Importing the
root from any other condition throws immediately with an unsupported-environment error. The `types`
condition stays unconditional, so a non-RSC consumer type-checks against the full API and learns of
the restriction when the import executes; declaring the unsupported shape instead would trade one
clear runtime error for an unreadable authoring surface. Its application, shared protocol, browser,
server, and build graphs remain explicit. Browser code does not import server or build entries, and
only the RSC graph resolves React's `react-server` condition.

The server owns HTTP negotiation, request scope, Flight rendering, HTML streaming, and Bun listening.
The client owns Flight decoding, document hydration, and navigation. The build graph owns application
compilation and compiled-server loading.

## Package and application builds

Rslib emits the framework as bundleless ESM, declarations, and source maps under
`packages/effective-rsc/dist/`. The package export, `ersc` executable, and private compiler entries
all execute that JavaScript; raw TypeScript is not a published entry point. Top-level RSC directives
and the source graph boundaries survive compilation.

The published package also includes the authored guides under `docs/` and a generated `LLMS.md`.
Documentation examples type-check as part of the package tests, and the root check rejects a stale
generated document. The kitchen sink remains the sole application build and end-to-end integration
fixture. Like Effect's agent documentation, `0*` examples form a small inline canonical core while
later numbered examples become descriptive package-relative links.

`ersc build` runs a direct Rspack MultiCompiler with paired browser and server configurations. Rspack's
native RSC plugins assign RSC/SSR layers, produce client-reference data, and coordinate assets. Output
lives under `.ersc/client/` and `.ersc/server/`; the framework does not generate proxy source files.

A checked-in `'use server-entry'` module imports the application through one private alias. Only
`src/application.tsx` has filename semantics. Applications import CSS from the modules that use it;
there is no framework stylesheet alias. Rspack supplies ordered JavaScript and stylesheet metadata
to the compiled application. Fizz receives scripts as bootstrap assets and stylesheets as React
resources; assets are not fields in the Flight model.

The browser build targets the Navigation API browser floor and enables the React Compiler. The server
build targets Bun's Node 26 compatibility and omits the React Compiler. React, React DOM, and RSDR use
one exact compatible release.

CSS stays in Rspack's native pipeline. `@tailwindcss/webpack` compiles Tailwind CSS v4 from the
application root; applications install `tailwindcss` explicitly. React hoists emitted stylesheets
into the document head.

## Application model

`Application.ersc<Services>()` creates one application-scoped ERSC authoring module. It owns a service
universe, runtime identity, and request-runner context. Feature modules use its factories, then
`ERSC.make({ routes, layer })` closes the module into the executable application exported from
`src/application.tsx`.

| Value       | Role                                                                                  |
| ----------- | ------------------------------------------------------------------------------------- |
| `Page`      | Effectful route leaf.                                                                 |
| `Layout`    | Effectful route wrapper with one `children` outlet; the root owns the document shell. |
| `Loading`   | Synchronous, service-free fallback directly below its Layout.                         |
| `Component` | Effectful Server Component that is not a route concern.                               |
| `ServerFn`  | Promise-shaped native React reference backed by a lazy Effect on the server.          |
| `Routes`    | Immutable route graph with inherited Page HTTP middleware.                            |

Each effectful operation infers its own requirements and must fit within `Services`. JSX erases nested
requirements, so the universe is declared once. `ERSC.make` receives a closed Layer for that universe;
service-free applications call `Application.ersc()`. The application Layer may also register native
Effect HTTP routes, APIs, RPC, and global middleware on the framework router. The HTTP server builds
it once in its server scope, shares the resulting services across requests, and releases them when
that scope closes. Request Effects retain their independent interruption lifetime.

Every authored value carries its ERSC identity. Route composition rejects the wrong concern role or a
value from another ERSC instance. Server Functions retain that identity across native invocation and
execute only in the matching request runtime.

One property decides how a concern is represented: whether React consumes the authored value
directly. Layout, Loading, and Component are rendered by React, and ServerFn is invoked through
React's native reference protocol, so all four stay callable functions carrying a branded ERSC
identity. Page, Routes, and Application are read only by ERSC itself, so they are opaque handles.
Routes exposes only `page` and `mount`; Page and Application expose only their type contracts.
Internal compiler and server modules project those handles into runtime state through an accessor,
without a public field contract or a separate lookup registry. Page is the instructive case: React
does render its component, but authors hand a Page to Routes and never to React, so the handle stays
opaque and the component is projected out of it.

Each ERSC module owns an AsyncLocalStorage context for its request runner. Flight rendering binds one
FiberSet runner before React enters application code. Page, Layout, and Component operations retrieve
that runner without prop threading, while the FiberSet keeps their Effects attached to the HTTP
request lifetime.

Pages are explicit ERSC concerns with one ordinary parameter contract: `Page.make({ render })` is
static and `Page.make({ params, render })` retains the authored Effect Schema internally. The
parameterized Page's render operation receives decoded `params`, and Routes type-checks the Schema's
encoded object keys against the Page path parameters. Parameter Schemas must expose a finite,
non-empty key set whose encoded fields can accept strings; transformations may produce a different
decoded object for the render operation.

## Routes and Flight model

`Routes.make` builds immutable route values. `page(path, Page)` adds an Effect HTTP route pattern and
`mount(prefix, routes)` mounts a non-empty child graph from the same ERSC identity. Nested routes may
own Layout, Loading, both, or neither; the application root requires a Layout and at least one Page.
`:parameter` segments belong to Page paths; mount prefixes remain parameter-free so a mounted Routes
DAG has one unambiguous parameter owner. ERSC does not classify destinations as static, dynamic, or
catch-all: matcher syntax and selection belong to Effect HTTP.

Composition requires literal canonical paths and rejects invalid syntax, duplicate paths, empty
mounts, erased Page or Routes contracts, and invalid concern combinations. Patterns that differ only
by parameter name or static-segment casing conflict because Effect HTTP matches them identically.
Any pattern capable of matching the reserved `/_ersc/assets` namespace is rejected, including a
parameterized overlap. The compiler registers authored patterns directly with Effect HTTP, with no
second runtime matcher.

Compilation flattens the route graph into destination values containing the Effect HTTP pattern,
Page, ordered middleware, and ordered Layout/Loading ancestry. A mounted Routes value can appear under more than one
parameter-free prefix, so each destination owns its ancestry. Each registered Effect HTTP handler
closes over its destination. Parameter-free Pages use an empty parameter record without reading
router context; parameterized Pages receive the parameters captured by Effect HTTP and decode them
with their Schema in the request runtime. One shared renderer turns the matched destination into a
unary tree:

```text
Layout -> optional Loading -> nested scope -> ... -> Page
```

Each Flight node contains an opaque React `id`, Server Component content, and an optional child. IDs
encode identity for reconciliation but are not parsed as protocol data. Every request still carries
one complete route tree; there is no partial patch transport. Unknown patterns retain Effect HTTP's
native `404`. Mapping a matched Page's Schema rejection to NotFound or another expected failure
remains open.

Routes middleware is an opaque same-ERSC ownership adapter over Effect `HttpRouter.Middleware`.
ERSC resolves ancestor lists before descendant lists and combines their native descriptors once
while building the Page routes. Effect owns middleware composition and layer application, including
request-order execution and reverse response unwinding. The resulting layer wraps matched Page GET
and native HEAD fallback; Server Function POST, userland HTTP, assets, and unmatched paths remain
outside it. Native global Effect HTTP middleware registered by the application Layer surrounds the
whole router. Middleware may short-circuit with any native response but cannot introduce a typed
failure.

## Initial document

```text
request
  -> Effect HTTP route pattern, captured params, and request scope
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

`NavigateEvent.signal` owns the Flight request and its child Effect scope. The precommit handler
settles at the exact Layout commit, while a post-commit handler keeps the browser navigation active
until the Flight stream reaches EOF. Cancellation interrupts the transport and request-scoped server
Effects, then restores the last stable route tree and history entry. A superseding navigation retires
the earlier response after its successor starts rendering without briefly restoring the previous UI.

The Flight payload carries the final request URL. After a followed redirect, cancelable navigation
uses `NavigationPrecommitController.redirect`; non-cancelable traversal uses `location.replace`.
Non-Flight or non-success navigation responses promote to a full-document navigation.

The browser retains the currently revealed common Layout prefix. It caches only completed whole-tree
navigation payloads by `NavigationHistoryEntry.id`; Back/Forward traversal reuses those payloads,
while pushes, replacements, and uncached traversals fetch Flight. Disposing a history entry evicts its
payload. A Server Function refresh invalidates the traversal cache and stores the refreshed current
entry because application mutations may affect other routes.

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

## Known limitations

| ID    | Limitation                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| L-001 | A named Server Function factory export bound by a Server Component lacks the Rspack server-layer action metadata required to work. |
| L-002 | Inline or bound native Server Functions hit a bound-argument mismatch in the pinned Rspack/RSDR integration.                       |
| L-003 | Pre-hydration progressive enhancement executes the mutation, but the document response does not complete before Bun times out.     |

## Effect and lifetime boundaries

- Use Effect for failures, resources, cancellation, concurrency, services, and lifetimes; keep pure
  transformations and incidental adapters plain.
- Cross-graph service contracts stay implementation-free. The owning runtime exports their live
  Layers.
- `ServerApplication.httpLayer` composes negotiation, assets, routes, renderers, and application
  services. `ServerApplication.serverLayer` adds Bun listening.
- Rspack compilation is a scoped service owned by the CLI. Server modules do not start nested
  runtimes.
- `effect/unstable/http` owns HTTP lifecycles. `unstable/HttpApi` owns non-UI endpoints; React Server
  Functions own UI mutations.

## Command surface

- `create-ersc-app <directory>` writes a standalone application from a checked package template and
  installs its dependencies unless passed `--no-install`.
- `ersc build` emits `.ersc/client/` and `.ersc/server/`.
- `ersc start` loads the compiled server once and listens on port `18193` with Bun.

The scaffolder's template is a published product asset, not another integration fixture. The
kitchen-sink remains the only application that validates the complete framework pipeline.

There is no development command. D-041 through D-043 record the accepted but unimplemented dev-server
and HMR design.

## Kitchen-sink integration application

The kitchen-sink conference is both the primary real-world example and the current end-to-end
fixture. Its `application.tsx` is the composition boundary for Bun SQLite, SQL migration,
`ConferenceRepository`, and `ConferenceService`. The repository owns only SQL operations; the
service owns static conference joins, simulated latency, domain validation, and SQL-to-domain error
mapping. Agenda membership is shared conference state stored in `.data/conference.sqlite`; E2E runs
use a fresh `:memory:` database.
