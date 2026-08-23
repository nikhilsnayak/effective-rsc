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
have no routing semantics and may be organized however the author prefers. Its route map supplies
the static imports, URL topology, and ownership of each typed concern.

```tsx
const RootLayout = Layout.make({
  slots: ['sidebar', 'modal'],
  render: Effect.fn('RootLayout')(function* ({ children, sidebar, modal }) {
    return (
      <html>
        <body>
          <main>{children}</main>
          <aside>{sidebar}</aside>
          {modal}
        </body>
      </html>
    );
  }),
});

export default Application.make({
  routes: {
    '/': {
      layout: RootLayout,
      loading: RootLoading,
      page: HomePage,
      slots: {
        sidebar: { content: Sidebar, loading: SidebarLoading },
        modal: null,
      },
    },
    '/about': {
      page: AboutPage,
      slots: {
        sidebar: { content: Sidebar, loading: SidebarLoading },
        modal: null,
      },
    },
  },
});
```

- `Page.make(...)` accepts an operation created with `Effect.fn` or `Effect.fnUntraced` and turns it
  into a Server Component using the request Effect runtime.
- `Layout.make({ slots, render })` declares its named parallel-slot contract and accepts a
  layout-specific Effect operation. The root layout owns the full `<html>`, `<head>`, and `<body>`
  document tree. Its `children` prop is the implicit outlet for the matched Page and is not repeated
  in the `slots` declaration.
- `Slot.make(...)` accepts an Effect operation for a named parallel branch such as a sidebar or
  modal. A non-empty route slot may own its own synchronous Loading concern.
- `Loading.make(...)` accepts only a synchronous renderer and becomes the Suspense fallback for its
  route subtree.
- `ErrorBoundary.make(...)` and `NotFound.make(...)` define their own boundary contracts.
- Non-UI HTTP endpoints are declared through `unstable/HttpApi`, outside the UI route map.

`Application.make` derives valid paths, raw parameter names, nested layout ancestry, and the union
of required Effect services from one literal definition. It rejects invalid concern combinations.
The exact Effect Schema decoding API for path and search parameters remains open. Explicit Suspense
boundaries remain available within route components, and a `Loading.make` renderer that suspends is
a development error.

When Page or Layout operations require Effect services, `Application.make` requires a
`servicesLayer` property containing a fully composed Layer that provides their inferred service
union and has no remaining requirements. Service-free applications omit the property. The
application definition explicitly contains the composed React component and this Layer;
`Application.httpLayer` builds it with the renderer Layers and makes the resulting services visible
to each HTTP request, so request-scoped render Effects inherit the application context.
`Application.layer` then adds the production Bun listener. Layer construction errors remain in
their original typed error channel.

Each concern-specific factory has a private shared implementation where useful, but there is no
public generic segment factory. `Page.make`, `Slot.make`, `Layout.make`, `Loading.make`, and
`Application.make` are implemented in the current checkpoint. The route map accepts multiple
literal static paths; the root route owns the Layout and optional primary Loading concerns, and
every matched static route supplies one Page plus the exact named-slot record declared by that
Layout. `null` is an intentionally empty named slot. Layout, Page, and non-empty Slot operations
share the request Effect runtime, and the application combines all their service requirements.
Branded Page, Slot, Layout, and Loading values prevent route definitions from substituting arbitrary
components; Loading also rejects an explicitly asynchronous fallback.

## Route compilation — Working

The explicit route map is the source route tree and the static Rsbuild/Rspack module graph.
Compilation may emit manifests, but it does not discover application routes or reconstruct their
relationships from filenames. A checked-in framework RSC entry owns the application bootstrap. Two
private compiler aliases resolve its application and stylesheet imports to the fixed application
paths; applications cannot configure or import those aliases.

The `ersc build` command compiles the fixed `src/application.tsx` definition. The framework RSC entry
owns the native `'use server-entry'` directive, imports the application, and exports its actual root
Server Component as `ApplicationRoot`. The bootstrap composes both
`Application.httpLayer` and `Application.layer` around that same exported component. Development
mounts the former into Rsbuild's single HTTP server; production launches the latter with Bun.
Rspack attaches the entry's ordered `entryJsFiles` and `entryCssFiles` metadata to
`ApplicationRoot`. The compiled-server loader validates both lists. The HTML renderer passes the
scripts to Fizz as bootstrap scripts and renders the stylesheets as React resources at the SSR
boundary, where Fizz hoists them into the document `<head>`. Build resources do not become fields of
the application Flight payload.
The compiler uses the framework's real RSC, browser, and SSR modules directly rather than generating
proxy entries for them. Browser assets are emitted under
`.ersc/client/` and the Bun server bundle under `.ersc/server/`; `.ersc/` is the single application
build tree. Build and development compilers only watch real framework and application modules, so
another process has no shared generated source entry to remove or rewrite. Neither the directive nor
private compiler aliases are part of application
source or package metadata. Each literal static path is registered directly with Effect's HTTP
router when the application Layer is built, so request dispatch does not add a second framework
matcher. The application component performs one map lookup and creates an n-ary route tree. The
root Layout, matched Page, and every non-empty named Slot are independent values in that tree rather
than nested Server Components, so all of them can begin rendering without waiting for a parent.
The framework passes internal `RouteOutlet` placeholders as the Layout's `children` and declared
slot props; a Client Component recursively stitches each child node into its outlet in both the SSR
and browser client environments. Primary and slot-specific Loading concerns wrap only their owned
branch in native Suspense without delaying the root Layout or sibling branches. Unknown paths retain
the HTTP router's native empty `404` response. `/_ersc/assets` remains reserved for framework
compiler output. Dynamic matching and nested route-specific concerns are later slices; their
representation is already fixed as named branches of the same n-ary tree.

The shared route model is generic over its render data. Stable node keys, named slots, intentional
empty branches, and loading-boundary presence form the topology; Server Component content and
Loading output are transient render data. A structure-only `RouteTree<null>` therefore cannot retain
RSC values accidentally. A same-topology response overlay copies only its changed ancestor path and
retains untouched parallel branches by reference. The current renderer still receives a complete
tree in one native Flight response under D-005. This internal seam does not add a partial-route wire
protocol, cache policy, or prefetch behavior.

## Initial document request — Accepted

```text
Request
  -> Effect HTTP runtime
  -> Effect HTTP router exact static-path match
  -> request-scoped Layer and Scope
  -> React Server Components render produces { root, formState } as native Flight
  -> split Flight stream
       -> decode root in SSR environment -> React DOM HTML stream with formState
       -> embed Flight chunks into the HTML stream
  -> browser decodes the same payload -> hydrate document with root and formState
```

The browser hydrates from the embedded Flight stream and must not make another initial Flight
request. The Flight root is the complete document, so the browser hydrates `document` rather than a
framework container. Disconnecting the request cancels both branches and interrupts request-scoped
Effects.

## Client navigation — Accepted

```text
Navigation API event
  -> interrupt superseded navigation
  -> reuse a destination snapshot or fetch one whole-tree Flight response
  -> schedule an exact navigation revision in a React transition
  -> render the destination tree or its nearest Loading boundary
  -> resolve that render transaction's commit token from useLayoutEffect
  -> commit URL, UI, scroll, and optional View Transition
```

Navigation state and prefetch work have explicit lifetimes. The client router does not patch anchor
clicks or the History API as a fallback. React transitions schedule route rendering but do not own
request ordering: the Effect navigation state machine interrupts superseded work and prevents stale
responses from being scheduled. `useActionState` remains available to application forms and mutations,
but its sequential queue is not the router scheduler. A Navigation API precommit promise is resolved
only when `useLayoutEffect` commits the render transaction carrying the exact scheduled revision; a
global transition-pending flag is not a commit token.

The scoped internal `NavigationStateMachine` allocates monotonically increasing revisions and uses
an Effect `FiberHandle` as the single owner of active navigation work. React scheduling and revision
state changes are serialized so a completed superseded request cannot schedule a render. The lazy
schedule Effect submits the render while that ordering permit is held, then returns a commit Effect
backed by a private Effect `Deferred`; the permit is released before the navigation fiber awaits
commit. `useLayoutEffect` completes that exact render's Deferred. There is no Promise bridge or second
shared pending-commit record to synchronize. A later navigation interrupts the earlier fiber.
Interrupting the navigation caller interrupts its exact loading fiber, which lets the later Navigation
API boundary propagate `event.signal` without risking cancellation of a newer request.
Loading and waiting for React commit remain interruptible. An uninterruptible boundary around the
successful load installs response cancellation ownership atomically before entering the commit wait,
so interruption cannot abandon a response between those phases. The navigation fiber owns that
cancellation effect only while the render is pending: failure releases the response, while exact commit
lets the self-finalizing stream continue independently. Navigation API interception remains a separate
browser-boundary slice.

The browser root owns the React side of that boundary. It schedules both refresh and navigation
payloads with `startTransition`. Every non-initial render is a discriminated transaction carrying its
own private Effect `Deferred`; navigation transactions additionally carry their revision. The `hydrateRoot`
result is the imperative scheduling boundary: subsequent payloads are passed back to that root with
`root.render` rather than exporting a component state setter. Scheduling is rejected before the
initial layout commit and after unmount so it cannot abandon hydration or target a stale root.
The browser root owns no HTTP response state: its render transactions carry only the decoded payload
and exact commit Deferred. Ordering concurrent mutation responses remains part of the unfinished
router action queue. The Navigation API listener is a later slice.

The browser Flight loader requests one destination URL with `Accept: text/x-component`, rejects
non-success and non-Flight responses, and decodes the response through the native RSDR client. Its
HTTP request lives in a child of the browser Effect scope. The response stream closes that child scope
when it reaches EOF, errors, or is cancelled, while browser-scope closure remains the final shutdown
owner. Because RSDR starts consuming the stream eagerly, its reader keeps receiving nested Flight
chunks after the root model resolves without React retaining a separate transport resource. A successful
load returns an idempotent release effect only so pending navigation or Server Function work can cancel
an abandoned response before commit. Cache lookup, partial response formats, and Navigation API
interception remain separate later slices.

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
  infers only Layout, Page, and Slot services. A service used exclusively by a Server Function can
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
ownership boundary for the root Server Component; the framework consumes its native metadata rather
than reconstructing initial chunk relationships.

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
