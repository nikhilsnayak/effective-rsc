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
  basic/      executable specification and integration-test fixture
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
export default Application.make({
  routes: {
    '/': {
      layout: RootLayout,
      loading: RootLoading,
      page: HomePage,
    },
    '/users': {
      layout: UsersLayout,
      loading: UsersLoading,
    },
    '/users/:userId': {
      page: UserPage,
      error: UserError,
    },
  },
});
```

- `Page.make(...)` accepts an operation created with `Effect.fn` or `Effect.fnUntraced` and turns it
  into a Server Component using the request Effect runtime.
- `Layout.make(...)` accepts a layout-specific Effect operation and establishes a persistent nested
  layout contract. The root layout owns the full `<html>`, `<head>`, and `<body>` document tree.
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
public generic segment factory. `Page.make`, `Layout.make`, `Loading.make`, and the root-only
`Application.make` are implemented in the current checkpoint. Layout and Page operations share the
request-scoped Effect runtime, and the application combines their service requirements. Branded Page,
Layout, and Loading values prevent route definitions from substituting arbitrary components;
Loading also rejects an explicitly asynchronous fallback.

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
source or package metadata. The application component composes the root layout, optional native
Suspense boundary, and page without route discovery. Path matching, nested route compilation, and
schema decoding are later slices.

## Initial document request — Accepted

```text
Request
  -> Effect HTTP runtime
  -> compiled route matcher
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
  -> fetch whole-tree Flight response
  -> decode React tree
  -> React transition renders the nearest Loading boundary
  -> commit UI, URL, scroll, and optional View Transition
```

Navigation state and prefetch work have explicit lifetimes. The client router does not patch anchor
clicks or the History API as a fallback.

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
- `ServerFn.make` validates untrusted input, runs the implementation in the request Effect runtime,
  preserves React's native protocol, and propagates interruption.
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

React, React DOM, and Effect are shared authoring runtimes: application source imports them directly
and declares them as dependencies, while `effective-rsc` declares exact peer versions. The framework
does not vendor, alias, or re-export those packages. Framework-only adapters and compiler plugins,
including the Effect Bun and browser platforms and the official Rsbuild Tailwind plugin, remain
ordinary framework dependencies.

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
