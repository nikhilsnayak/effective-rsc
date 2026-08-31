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

| Work                            | Owner                           | Completion or interruption                       |
| ------------------------------- | ------------------------------- | ------------------------------------------------ |
| Application services            | Server scope                    | Server shutdown                                  |
| HTTP and Server Function Effect | Request fiber                   | Response completion, disconnect, or interruption |
| Authored render Effects         | Request render-runtime FiberSet | Flight completion or request interruption        |
| Browser Flight decode           | Navigation handler              | Flight EOF, cancellation, or supersession        |
| Retained navigation entry       | Browser navigation resources    | Replacement or disposal                          |

Effect interruption and Web Stream cancellation propagate across these boundaries. Work is not
detached unless another explicit owner retains it.

## Protocol ownership

| Concern                              | Owner                               | ERSC responsibility                                              |
| ------------------------------------ | ----------------------------------- | ---------------------------------------------------------------- |
| Route matching and native middleware | Effect HTTP                         | Compile authored routes and preserve native semantics            |
| RSC and Server Functions             | React and `react-server-dom-rspack` | Add Effect execution, Schema decoding, and lifecycle wiring      |
| HTML rendering                       | React Fizz and `rsc-html-stream`    | Tee Flight, surface pre-shell failure, and own stream finalizers |
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
requests must be same-site, and their body is rejected while streaming once it exceeds the configured
limit. Public assets use Effect `HttpStaticServer`; application HTTP routes, APIs, RPC, and global
middleware share the same router and Layer.

## Middleware reach

| Request                          | Scoped route middleware              | Scoped Server Function middleware | Native global middleware |
| -------------------------------- | ------------------------------------ | --------------------------------- | ------------------------ |
| Page GET/HEAD                    | Matched route scope                  | No                                | Yes                      |
| Hydrated Server Function POST    | Remaining route scope around refresh | Action scope                      | Yes                      |
| Progressive Server Function POST | No route refresh in the POST         | Action scope                      | Yes                      |
| Userland HTTP, assets, unmatched | No                                   | No                                | Yes                      |

Within one Server Function request, a middleware already active in the action scope is not executed
again for the route refresh, even if it appears at a different position in the route chain.

## Owners

- [`server/application.ts`](../../packages/effective-rsc/src/server/application.ts)
- [`server/html-renderer.tsx`](../../packages/effective-rsc/src/server/html-renderer.tsx)
- [`server/flight-renderer.tsx`](../../packages/effective-rsc/src/server/flight-renderer.tsx)
- [`client/navigation-resource.ts`](../../packages/effective-rsc/src/client/navigation-resource.ts)
