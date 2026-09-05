# Lifetimes, failures, and protocols

## Lifetime ownership

```text
Bun server scope
└─ application Layer
   └─ HTTP request fiber
      ├─ Server Function handler Effect, when applicable
      ├─ Flight render scope
      │  └─ render-runtime FiberSet
      │     └─ Page, Layout, and Component Effects
      └─ response stream finalizers
```

| Work                               | Owner                           | Completion or interruption                             |
| ---------------------------------- | ------------------------------- | ------------------------------------------------------ |
| Application services               | Server scope                    | Server shutdown                                        |
| Development generation services    | Generation scope                | Replacement or shutdown, after cancelling its requests |
| HTTP and Server Function Effect    | Request fiber                   | Response completion, disconnect, or interruption       |
| Authored render Effects            | Request render-runtime FiberSet | Flight completion or request interruption              |
| Preparing browser navigation       | Client-router candidate         | First UI commit, native abort, or supersession         |
| Visible navigation Flight stream   | Client-router generation        | Flight EOF or renderer-confirmed retirement            |
| Completed history-entry route tree | Browser route cache             | Cache invalidation or history-entry disposal           |

Effect interruption and Web Stream cancellation propagate across these boundaries. Work is not
detached unless another explicit owner retains it.

The native `NavigateEvent.signal` participates until the first UI commit. The client router then
owns any remaining Flight stream. See [Client router](client-router.md) for transfer and retirement
rules.

## Protocol ownership

| Concern                              | Owner                               | ERSC responsibility                                              |
| ------------------------------------ | ----------------------------------- | ---------------------------------------------------------------- |
| Route matching and native middleware | Effect HTTP                         | Compile authored routes and preserve native semantics            |
| RSC and Server Functions             | React and `react-server-dom-rspack` | Add Effect execution, Schema decoding, and lifecycle wiring      |
| HTML rendering                       | React Fizz and ERSC Flight injector | Tee Flight, surface pre-shell failure, and own stream finalizers |
| Browser navigation                   | Navigation API                      | Coordinate visible commit, completion, cancellation, and cache   |
| Application resources                | Effect Layer                        | Build once and release at server shutdown                        |

## Failure boundaries

- A wiring invariant unreachable from request or application input throws a plain `TypeError`.
- Request input, I/O, and application failures remain typed Effect failures at their boundary.
- React's stream protocol carries Flight failures.
- If Fizz fails before the HTML shell, Effect HTTP returns an empty `500`. After headers commit,
  React and Web Streams own boundary recovery or stream termination.
- Expected request aborts do not log as render failures.
- Browser hydration uses one framework error boundary so an unexpected render failure does not crash
  outside React.

## HTTP policy

Page requests vary on the headers used for Flight and HTML negotiation. Server Function browser
requests must carry an Origin whose host matches the request `Host`; forwarded host headers are not
trusted. Bun rejects any request body larger than 10 MiB before it reaches framework routing, so
Server Function input is bounded before React decodes it. Public assets use Effect
`HttpStaticServer`; application HTTP routes, APIs, RPC, and global middleware share the same router
and Layer.

`serverLayer` binds Bun explicitly rather than through `NODE_ENV`: contextual error pages stay off,
so a failure escaping the router cannot answer with its message and source stack, and the idle
timeout stays off, so a stalled Suspense boundary keeps its connection. The server-wide request
body limit is 10 MiB. Connection deadlines belong to the deployment in front of the application.

## Middleware reach

| Request                          | Scoped route middleware              | Scoped Server Function middleware | Native global middleware |
| -------------------------------- | ------------------------------------ | --------------------------------- | ------------------------ |
| Page GET/HEAD                    | Matched route scope                  | No                                | Yes                      |
| Hydrated Server Function POST    | Remaining route scope around refresh | Server Function scope             | Yes                      |
| Progressive Server Function POST | Remaining route scope around refresh | Server Function scope             | Yes                      |
| Userland HTTP, assets, unmatched | No                                   | No                                | Yes                      |

Within one Server Function request, middleware already active in the Server Function scope is not
executed again for the route refresh, even if it appears at a different position in the route chain.

## Owners

- [`server/application.ts`](../../packages/effective-rsc/src/server/application.ts)
- [`server/html-renderer.tsx`](../../packages/effective-rsc/src/server/html-renderer.tsx)
- [`server/flight-renderer.tsx`](../../packages/effective-rsc/src/server/flight-renderer.tsx)
- [`client/route-loader.ts`](../../packages/effective-rsc/src/client/route-loader.ts)
