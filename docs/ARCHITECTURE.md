# Architecture

## Repository shape — Accepted

```text
packages/
  effective-rsc/
    src/
      application/  application definition and concern factories
      rsc/          shared Flight protocol contracts
      client/       hydration and Navigation API runtime
      server/       Effect HTTP, RSC rendering, SSR, and request scope
      build/        Rsbuild lifecycle, compiler entry, and compiled-server loading

examples/
  kitchen-sink/  realistic conference-planner example and integration-test fixture
```

`effective-rsc` is the only framework package and intentionally aggregates the application API at
its root. It does not expose build-tool-, bundler-, or runtime-specific subpaths: Rsbuild, Rspack,
and Bun are framework choices rather than adapters selected by application developers.

The `application` graph implements the public factories. The `rsc` graph contains protocol values
shared by the browser and server without importing either runtime. The `server` graph owns Flight
rendering, Flight-to-HTML streaming, request negotiation, static assets, and the final Bun
application Layer. The `client` graph owns native Flight decoding and full-document hydration,
while the framework-owned browser entry runs that Effect with `BrowserRuntime`. The `build` graph
owns the small application bootstrap and a complete fixed Rsbuild configuration for the coordinated
browser, RSC, and SSR module graphs. `rsbuild-plugin-rsc` assigns the actual SSR module to Rspack's
SSR layer and owns the native RSC bundler integration; compiler configuration does not reconstruct
the server runtime.

## Application model — Accepted

`Application.make({ routes, servicesLayer })` is the public application composition API. The
application has one fixed definition at `src/application.tsx`; other filenames and directories
have no routing semantics and may be organized however the author prefers. Immutable `Routes`
values supply the static imports, URL topology, nested Layout ancestry, and ownership of each typed
concern. Feature modules can export their own Routes and the application composes them with
`mount`.

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

- `Routes.make()` creates an immutable layoutless route collection. `page(relativePath, Page)` adds
  one exact relative destination and `mount(prefix, childRoutes)` composes a non-empty child while
  preserving its Layout and Loading scope. A layoutless, loadingless child only groups and prefixes
  paths; it does not add a rendered route node.
- A Routes value may own an optional Layout, an optional Loading concern, both, or neither. Only the
  root Routes passed to `Application.make` must own a Layout, and the complete graph must contain at
  least one Page. Duplicate final paths, invalid static syntax, empty mounts, and the reserved
  `/_ersc/assets` namespace are rejected by types and checked again at runtime.
- `Page.make(...)` accepts an operation created with `Effect.fn` or `Effect.fnUntraced` and turns it
  into a Server Component using the request Effect runtime.
- `Layout.make({ render })` accepts a layout-specific Effect operation with one `children` outlet.
  The root Layout owns the full `<html>`, `<head>`, and `<body>` document tree. Nested Layouts are
  optional and remain mounted while navigation changes a descendant Page.
- `Loading.make(...)` accepts only a synchronous renderer and becomes the Suspense fallback for its
  owning Routes subtree. Its boundary is compiled immediately below that Routes' Layout, so the
  Layout remains revealed while a descendant suspends. The Layout keeps its Routes-scope identity
  across descendant navigations, while the Loading boundary and Page use the matched pathname so a
  new destination can reveal that boundary's fallback.
- `ErrorBoundary.make(...)` and `NotFound.make(...)` define their own boundary contracts.
- Non-UI HTTP endpoints are declared through `unstable/HttpApi`, outside the UI Routes graph.

`Application.make` derives valid paths, raw parameter names, nested layout ancestry, and the union
of required Effect services from one literal definition. It rejects invalid concern combinations.
The exact Effect Schema decoding API for path and search parameters remains open. Explicit Suspense
boundaries remain available within route components, and a `Loading.make` renderer that suspends is
a development error.

When Page or Layout operations require Effect services, `Application.make` requires a
`servicesLayer` property containing a fully composed Layer that provides their inferred service
union and has no remaining requirements. Service-free applications omit the property. The
application definition explicitly contains the route-tree renderer and this Layer;
`Application.httpLayer` builds it with the renderer Layers and makes the resulting services visible
to each HTTP request, so request-scoped render Effects inherit the application context.
`Application.layer` then adds the production Bun listener. Layer construction errors remain in
their original typed error channel.

Each concern-specific factory has a private shared implementation where useful, but there is no
public generic segment factory. `Routes.make`, `Page.make`, `Layout.make`, `Loading.make`, and
`Application.make` are implemented in the current checkpoint. Layout and Page operations share the
request Effect runtime, and composition carries their service requirements through every mount.
Branded Page, Layout, and Loading values prevent route definitions from substituting arbitrary
components; Loading also rejects an explicitly asynchronous fallback. Named parallel Slots are not
part of this checkpoint; adding them later must extend the composition model without weakening
nested Layout ownership.

## Route compilation — Working

The explicit composed Routes value is the source route graph and the static Rsbuild/Rspack module graph.
Compilation may emit manifests, but it does not discover application routes or reconstruct their
relationships from filenames. A checked-in framework RSC entry owns the application bootstrap. Two
private compiler aliases resolve its application and stylesheet imports to the fixed application
paths; applications cannot configure or import those aliases.

The `ersc build` command compiles the fixed `src/application.tsx` definition. The framework RSC entry
owns the native `'use server-entry'` directive, imports the application, and passes that definition
through as its default export. The bootstrap composes both
`Application.httpLayer` and `Application.layer` around that same application definition. Development
mounts the former into Rsbuild's single HTTP server; production launches the latter with Bun.
Rspack attaches the entry's ordered `entryJsFiles` and `entryCssFiles` metadata to
the compiled application object. The compiled-server loader validates both lists. The HTML renderer passes the
scripts to Fizz as bootstrap scripts and renders the stylesheets as React resources at the SSR
boundary, where Fizz hoists them into the document `<head>`. Build resources do not become fields of
the application Flight payload.
The compiler uses the framework's real RSC, browser, and SSR modules directly rather than generating
proxy entries for them. Browser assets are emitted under
`.ersc/client/` and the Bun server bundle under `.ersc/server/`; `.ersc/` is the single application
build tree. Build and development compilers only watch real framework and application modules, so
another process has no shared generated source entry to remove or rewrite. Neither the directive nor
private compiler aliases are part of application
source or package metadata. Application construction traverses the immutable mount graph once,
derives every Page's absolute path and ordered Layout/Loading ancestry, and stores a flat lookup map.
Each literal path is then registered directly with Effect's HTTP router, so request dispatch does not
add a second framework matcher. One lookup produces a unary render tree ordered as ancestor Layout,
that scope's optional Loading boundary, nested scope, and matched Page. `RouteOutlet` recursively
renders the one child in both SSR and browser environments.

Layout and Page contents remain independent values in the native Flight model rather than nested
server calls, so React can begin their work without a parent-to-child data waterfall. Loading is an
explicit Suspense node below its owning Layout. During `/schedule` to `/schedule/day-two`, React
therefore reconciles the same `/schedule` Layout and Loading identities while only the descendant
Page changes; persistent navigation or sidebar UI in that Layout does not reveal the Page fallback.
Unknown paths retain the HTTP router's native empty `404` response. `/_ersc/assets` remains reserved
for framework compiler output, and dynamic matching remains a later slice.

Every render node has one local `id`: a Layout or Loading node uses its absolute mount prefix and a
Page uses its absolute pathname. The renderer uses it directly as local React identity and does not
parse it. Each node owns only its Server Component content and optional child. The complete unary tree
travels in one Flight response under D-005; the framework retains no speculative partial-tree patch
representation before that protocol is designed.

## Initial document request — Accepted

```text
Request
  -> Effect HTTP runtime
  -> Effect HTTP router exact static-path match
  -> request-scoped Layer and Scope
  -> React Server Components render produces { routeTree, formState } as native Flight
  -> split Flight stream
       -> decode route tree in SSR environment -> React DOM HTML stream with formState
       -> embed Flight chunks into the HTML stream
  -> browser decodes the same payload -> render the route tree and hydrate document with formState
```

The browser hydrates from the embedded Flight stream and must not make another initial Flight
request. The Flight route tree contains the complete document render, so the browser hydrates
`document` rather than a framework container. Disconnecting the request cancels both branches and
interrupts request-scoped Effects.

## Client navigation — Working

```text
Navigation API event
  -> start one React transition for the complete navigation Action
  -> interrupt superseded navigation
  -> fetch one fresh whole-tree Flight response
  -> await the root Flight model while nested chunks keep streaming
  -> publish the destination route tree
  -> React reconciles stable keyed branches and reveals Loading for changed branches
  -> resolve the navigation's exact commit from useLayoutEffect
  -> commit URL, UI, scroll, and optional View Transition
```

Navigation work has an explicit lifetime. The client router does not patch anchor
clicks or the History API as a fallback. React transitions schedule route rendering but do not own
request ordering. The Navigation API exposes one ongoing navigation and aborts its `NavigateEvent.signal`
when another navigation supersedes it. The browser Effect runtime propagates that signal directly into
the Flight request and the exact React commit wait, so there is no revision counter, secondary router
queue, or intermediate publication state. The user navigation Action itself is the single transition
boundary; a later tree update must not introduce another transition. A Navigation API precommit promise
is resolved only after React commits UI for that exact navigation; a global transition-pending flag is
not a commit token.

The Flight request starts synchronously inside that transition. The Action awaits only the decoded root
Flight model, not the complete response body; nested Server Component chunks continue streaming through
RSDR. It publishes the root route tree, then sequences the exact commit wait. If cancellation or commit
failure arrives after the top-level model is available, the commit wait releases the response resource;
failure while loading is released by the loader itself. A successful commit lets the self-finalizing
Flight stream continue independently.

The scoped browser boundary listens directly to `window.navigation`. It leaves non-interceptable
destinations, hash-only changes, downloads, form submissions, document reloads, and React's internal
`info: "react-transition"` navigation untouched. Reload remains browser-owned so it refreshes the
document and compiled assets. Cancelable navigations run the state machine from a
`precommitHandler`, so the URL and history entry do not update until the exact React layout commit.
The Navigation API deliberately makes some traversals non-cancelable to prevent applications from
trapping users; those unavoidable cases use its post-commit `handler` while retaining the same Effect
cancellation and rendering path. The event's `AbortSignal` interrupts the callback fiber, and closing
the browser Effect scope removes the listener. Native post-navigation focus and scroll behavior remain
enabled.

The React boundary publishes the decoded route tree once the root Flight model is available. The
navigation owns a native commit promise and passes only its resolver into `BrowserRoot`; the root's
layout effect invokes it after React commits that exact tree. There is no Effect synchronization
primitive inside the React boundary, intermediate loaded signal, optimistic projection, temporary route
topology, or second canonical state update. React reconciles stable ancestor Layout and Loading
identities while a changed Page reveals its server-provided fallback until the corresponding nested
Flight content arrives.

The router currently has no route cache: push, replace, and history traversal all fetch a fresh
whole-tree Flight response. Back/Forward caching, prefetch ownership, eviction, invalidation, partial
segment entries, and Activity retention remain one later design problem rather than hidden policy in
this checkpoint.

The browser Flight loader requests one destination URL with `Accept: text/x-component`, rejects
non-success and non-Flight responses, and decodes the response through the native RSDR client. Its
HTTP request lives in a child of the browser Effect scope. The response stream closes that child scope
when it reaches EOF, errors, or is cancelled, while browser-scope closure remains the final shutdown
owner. Because RSDR starts consuming the stream eagerly, its reader keeps receiving nested Flight
chunks after the route-tree model resolves without React retaining a separate transport resource. A successful
load returns an idempotent release effect only so pending navigation or Server Function work can cancel
an abandoned response before commit. Partial response formats remain a later slice.

## Server Functions — Working

Effective-rsc uses React's Server Function protocol for UI-coupled mutations. The framework owns
the Effect execution boundary and whole-tree refresh, but React and RSDR continue to own server
references, argument encoding, temporary references, form decoding, form state, and Flight.
`unstable/RPC` does not replace this path.

The current vertical slice has three distinct authoring shapes. Only the first is supported by the
pinned, unmodified toolchain:

| Authoring shape                                                                                              | Current evidence                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A named `ServerFn.make` export imported and bound by a Client Component                                      | Working for hydrated calls.                                                                                                                                                                                           |
| A named `ServerFn.make` export imported by a Server Component, bound there, and passed to a Client Component | Blocked because the pinned Rspack server transform omits factory-created named exports from its server-layer action metadata. The upstream fix is [rspack#15298](https://github.com/web-infra-dev/rspack/pull/15298). |
| An inline native Server Function with compiler-captured lexical values                                       | Blocked because the pinned Rspack transform imports `encryptActionBoundArgs` and `decryptActionBoundArgs`, while RSDR 0.1.0 exports the corresponding helpers with `Server` in their names.                           |

Local default-export, compiler-alias, and RSDR-export-renaming workarounds are deliberately excluded.
They made isolated demonstrations pass without proving the intended native contract. The blocked
integration coverage should return only after compatible upstream releases make it pass unchanged.

The working request path decodes the native reply or form action, loads the native server reference,
executes its result inside the Effect HTTP request, rerenders the complete route, and returns native
Flight. The browser callback uses a scoped `FiberSet.makeRuntimePromise` runner because RSDR's
`callServer` boundary requires a Promise. That runner is owned by the browser runtime scope rather
than detached from it. The callback must return the imperative Server Function result without waiting
for the scheduled refresh to commit; waiting creates a cycle with React's action completion. The
post-schedule commit wait is therefore forked directly into the captured browser scope. Failure before
commit cancels the response; success leaves its eager RSDR reader to finish and self-finalize the child
response scope. Browser-scope closure interrupts pending waits and closes any unfinished responses.

The progressive form path reaches and executes the same mutation before hydration, but the resulting
full-document stream currently does not complete and Bun eventually times out the request. Its
Playwright coverage remains an explicit `fixme`; progressive enhancement is not yet counted as a
working Server Function capability.

The Effect-to-Server-Function bridge itself remains unfinished:

- `ServerFn.make` is publicly typed as returning a Promise because that is the client-reference
  contract, but its server implementation currently returns an Effect behind a cast. Framework-owned
  invocation works; direct or nested server-side invocation is not yet an honest native async
  contract.
- Its phantom Effect service requirement is not aggregated by `Application.make`, which currently
  infers only Layout and Page services. A service used exclusively by a Server Function can
  therefore be missing at runtime without a type error.
- Effect-returning handlers inherit request services and interruption. An arbitrary native Promise
  can be awaited by the request fiber, but its underlying work cannot be cancelled unless that
  Promise observes an abort signal.
- Native Promise rejection must use `Effect.tryPromise`; interruption classification must distinguish
  interruption-only causes; decoded argument counts need a limit before invocation; and concurrent
  client responses need ordering in the future router action queue.
- The provisional `serverFnResult` Flight field proves that one response can carry both a refreshed
  tree and an imperative return value. Its final success and failure representation remains the open
  payload decision recorded in `OPEN_QUESTIONS.md`.

## Effect boundaries — Accepted

- Effect is the framework core's execution model, not only a wrapper around public APIs. Compiler,
  build, server, and client orchestration use Effect when it materially models failures, resources,
  cancellation, concurrency, or lifetimes. Pure transformations and incidental boundary code stay
  plain TypeScript.
- Renderer capabilities are `Context.Service` classes. A service owns its inferred `make` Effect
  and `static readonly layer = Layer.effect(this, this.make)` when its contract and implementation
  share a runtime graph. A contract consumed across runtime graphs remains implementation-free;
  the owning runtime exports its live `*Layer` instead.
- `HtmlRenderer` is a neutral contract consumed by the HTTP route graph, while `HtmlRendererLayer`
  belongs exclusively to the SSR graph. The handwritten `Application.httpLayer` composes the live
  renderer Layers and installs them as request services with `HttpRouter.provideRequest`; service
  keys or effectful operations are not passed through factory parameters as manual dependency
  injection.
- `Application.httpLayer(App)` is the sole request-composition boundary. It owns Flight versus
  document negotiation, static browser assets, renderer Layers, Effect HTTP routes, and the services
  Layer carried by the application definition. `Application.layer(App)` adds the production Bun
  listener. Both require only `ServerConfig`; neither accepts services as manual factory parameters.
- Rsbuild compilation is exposed through the `Rsbuild` service. Its `build` operation creates the
  programmatic Rsbuild instance with the framework's fixed configuration and acquires its build
  result with `Effect.acquireRelease`; the scoped CLI command owns closing it.
- The CLI is the process runtime owner. `ersc start` supplies `ServerConfig` and launches the
  compiled `ServerLayer`; server modules do not start nested runtimes.
- `effect/unstable/http` is the mandatory HTTP and request-lifecycle substrate.
- `unstable/HttpApi` owns schema-driven non-UI HTTP endpoints; they are not UI route-map concerns.
- React Server Functions own UI-coupled mutations and form behavior.
- `ServerFn.make` is the additive Effect and Schema authoring boundary described by the Working
  Server Functions section. It must not replace React's transport or narrow native authoring shapes.
- `unstable/RPC` is excluded from v0. A future version may use it only for long-lived streams,
  subscriptions, actors, or background service calls that do not imply an RSC refresh.

## Build environments — Accepted

Rsbuild owns the coordinated browser and server environments over Rspack. `rsbuild-plugin-rsc` keeps
distinct RSC and SSR layers so React's `react-server` condition and Client Component references are
applied only in the correct graph. React, React DOM, and `react-server-dom-rspack` use one exact
compatible Canary release. The Rspack-specific `'use server-entry'` directive is also the asset
ownership boundary for the application module graph; the framework consumes its native metadata
rather than reconstructing initial chunk relationships.

Tailwind CSS v4 is the sole framework-integrated styling toolchain. Every application owns the fixed
`src/styles.css` entry, beginning with `@import 'tailwindcss'`, while effective-rsc owns the official
Rsbuild Tailwind plugin and its fixed configuration. Plain CSS imports and `.module.css` imports use
Rsbuild's built-in support without a framework abstraction. All CSS reachable from the application
module graph is emitted through the native `'use server-entry'` asset boundary, and React's
stylesheet-resource semantics place the resulting stylesheets in the head of the full SSR document.
The application declares Tailwind because its stylesheet imports it; component-library packages
imported by application source also remain application dependencies.

React, React DOM, Effect, and `react-server-dom-rspack` are shared runtimes: application source
declares them as dependencies, while `effective-rsc` declares exact peer versions. The framework
does not vendor, alias, or publicly re-export them.
`react-server-dom-rspack` is not an application authoring API, but its peer placement lets Rspack
resolve the protocol imports injected into the application graph without bypassing isolated
dependency boundaries. Framework-only adapters and compiler plugins, including the Effect Bun and
browser platforms and the official Rsbuild Tailwind plugin, remain ordinary framework dependencies.

The public `effective-rsc` CLI is built with `effect/unstable/cli`. It owns build and start command
parsing, supplies Bun platform services, and delegates compilation to the private `build` module
graph and its `Rsbuild` service.
Applications do not maintain an Rsbuild or Rspack configuration and do not invoke Rsbuild directly.

`ersc dev` creates the same fixed configuration through Rsbuild's programmatic API. Rsbuild owns the
public development origin on port `18193`, in-memory browser assets, HMR, and RSC diagnostics. After
each successful server compilation, its environment API loads the fresh `main` server entry. The CLI swaps
the compiled Effect HTTP handler mounted behind Rsbuild's development middleware and disposes the
previous handler's Layer scope. Rsbuild assets, diagnostics, application requests, and HMR therefore
share one listener and one origin. Closing the CLI scope disposes the active application handler and
the Rsbuild development server.

`ersc start` imports the production server bundle once in a fresh Bun process and serves directly on
port `18193` (`R` = 18, `S` = 19, `C` = 3).

Bun owns package management, repository scripts, development servers, production execution, and the
first HTTP runtime integration. Vitest and `@effect/vitest` own test orchestration in their supported
Node runtime; integration tests launch and exercise the compiled application under Bun. This test
runner boundary is not a Node framework runtime adapter. Runtime adapter portability, including a
dedicated Node application runtime, is deferred.
