# Architecture

## Repository shape — Working

Package boundaries will be created by the first vertical slice rather than as empty placeholders.
The intended shape is:

```text
packages/
  core/       shared public types and authoring APIs
  rspack/     compilation, directives, manifests, and route generation
  server/     Effect HTTP, RSC rendering, SSR, and request scope
  client/     hydration and Navigation API runtime

examples/
  basic/      executable specification and integration-test fixture
```

The split is working rather than accepted until the real Rspack module graphs prove where the
boundaries belong. Browser, RSC, and SSR environments remain explicit even if their implementation
eventually shares a package.

## Authoring model — Accepted

The filesystem is the only public routing API. A compiler turns it into a generated typed route tree;
the runtime never discovers or imports routes by concatenating request paths.

```text
app/
  layout.tsx
  loading.tsx
  page.tsx
  error.tsx
  not-found.tsx

  users/
    [userId]/
      page.tsx

  api/
    users/
      route.ts
```

- `page.tsx` defines a page Server Component.
- `layout.tsx` defines a persistent nested layout.
- `loading.tsx` becomes the Suspense fallback around that segment's subtree.
- `error.tsx` and `not-found.tsx` define route boundaries.
- `route.ts` defines a non-UI HTTP endpoint and cannot coexist with `page.tsx` at one URL.
- `[name]`, `[...name]`, and `(group)` represent dynamic, catch-all, and pathless group segments.

Explicit Suspense boundaries remain available within route components. A `loading.tsx` fallback must
render synchronously; suspending from it is a development error.

## Initial document request — Accepted

```text
Request
  -> Effect HTTP runtime
  -> generated route matcher
  -> request-scoped Layer and Scope
  -> React Server Components render produces Flight
  -> split Flight stream
       -> decode in SSR environment -> React DOM HTML stream
       -> embed Flight chunks into the HTML stream
  -> Response
```

The browser hydrates from the embedded Flight stream and must not make another initial Flight
request. Disconnecting the request cancels both branches and interrupts request-scoped Effects.

## Client navigation — Accepted

```text
Navigation API event
  -> interrupt superseded navigation
  -> fetch whole-tree Flight response
  -> decode React tree
  -> React transition renders the nearest loading.tsx boundary
  -> commit UI, URL, scroll, and optional View Transition
```

Navigation state and prefetch work have explicit lifetimes. The client router does not patch anchor
clicks or the History API as a fallback.

## Effect boundaries — Accepted

- `effect/unstable/http` is the mandatory HTTP and request-lifecycle substrate.
- `unstable/HttpApi` owns schema-driven non-UI `route.ts` endpoints.
- React Server Functions own UI-coupled mutations and form behavior.
- `ServerFn.make` validates untrusted input, runs the implementation in the request Effect runtime,
  preserves React's native protocol, and propagates interruption.
- `unstable/RPC` is excluded from v0. A future version may use it only for long-lived streams,
  subscriptions, actors, or background service calls that do not imply an RSC refresh.

## Build environments — Accepted

Rspack owns coordinated browser and server compilers. The server compiler keeps distinct RSC and SSR
layers so React's `react-server` condition and Client Component references are applied only in the
correct graph. React, React DOM, and `react-server-dom-rspack` use one exact compatible Canary release.

Bun owns workspace tooling, repository scripts, development servers, production execution, and the
first HTTP runtime integration. Server bundles are compiled and tested for Bun. Runtime adapter
portability, including a dedicated Node runtime, is deferred.
