# Lifetimes, failures, and protocols

## Lifetime ownership

```text
Bun server scope
└─ application Layer
   └─ HTTP request fiber
      ├─ Server Function handler Effect, when applicable
      ├─ returned Stream producer (request-owned FiberHandle)
      ├─ Flight render scope
      │  └─ render-runtime FiberSet
      │     └─ Page, Layout, and Component Effects
      └─ response stream finalizers
```

| Work                               | Owner                           | Completion or interruption                               |
| ---------------------------------- | ------------------------------- | -------------------------------------------------------- |
| Application services               | Server scope                    | Server shutdown                                          |
| Development generation services    | Generation scope                | Replacement or shutdown, after cancelling its requests   |
| HTTP and Server Function Effect    | Request fiber                   | Response completion, disconnect, or interruption         |
| Returned Server Function Stream    | Request-scoped FiberHandle      | Producer completion or interruption, with cleanup joined |
| Authored render Effects            | Request render-runtime FiberSet | Flight completion or request interruption                |
| Preparing browser navigation       | Client-router candidate         | First UI commit, native abort, or supersession           |
| Visible navigation Flight stream   | Client-router generation        | Flight EOF or renderer-confirmed retirement              |
| Published current-route refresh    | Browser scope                   | Flight EOF, render retirement, or browser shutdown       |
| Completed history-entry route tree | Browser route cache             | Cache invalidation or history-entry disposal             |

Effect interruption and Web Stream cancellation propagate across these boundaries. Work retained
beyond its caller has an explicit lifetime owner.

Browser `ServerFn.stream` consumption owns its request through both returned-stream EOF and Flight
response completion. Values are emitted immediately; after returned-stream EOF the consumer awaits
the response's completion, including trailing Server Component content. Early termination,
interruption, or failure cancels unfinished request work. Response failures remain stream failures
even after the last value. Successful completion means delivery finished, not that received React
content rendered successfully. Nested render errors remain React errors at their point of use.
A plain `query` Effect owns only the pending result; the browser runtime retains any remaining
Flight content. Atom helpers interrupt superseded runs. See [request flows](request-flows.md).

The native `NavigateEvent.signal` participates until the first UI commit. The client router then
owns any remaining Flight stream. See [Client router](client-router.md) for transfer and retirement
rules.

### Returned-stream cleanup

`serverFnResponse` retains Effect's native `Stream.toReadableStreamEffect` adapter. A `Stream.onStart`
hook registers the adapter's producer fiber in a request-scoped `FiberHandle` before authored stream
work begins. Closing the request interrupts that fiber and awaits its asynchronous finalizers before
releasing request resources, independently of the Web Stream's reader lock.

Native reader cancellation still interrupts the same producer. If cancellation has already started,
request cleanup waits for it to finish. Normal completion removes the fiber from the handle, so later
request closure does not rerun its finalizers. React continues to own Flight encoding and consumption.

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
- Page parameter Schema rejection on GET/HEAD becomes an empty `404` before rendering. Decoder
  defects, interruption, and application render failures are not mapped to `404`. POST refresh
  parameter rejection remains in React's render-error path, preserving the Server Function result.
- Hydrated mutations and queries encode completed outcomes in a `200` Flight result: a success
  value, `ServerFnInputError`, or `ServerFnDefect`. Defects carry a digest correlated with server logs;
  explicit defect details are development-only. This common contract is an ERSC choice (D-072).
- Encoding, HTTP, or initial response decoding failures become `ServerFnTransportError` at the
  shared browser callback. Existing framework errors retain their identity through query helpers.
- Midstream failures use React's Flight protocol. Stream helpers map a React server digest to
  `ServerFnDefect`; other failures become `ServerFnTransportError`. Production React details remain
  redacted. A result already settled cannot be rejected again by a later Flight failure.
- Progressive forms preserve native HTTP handling: invalid input returns `400`; unhandled defects
  follow the HTTP error path. They do not expose the hydrated error envelope.
- If Fizz fails before the HTML shell, Effect HTTP returns an empty `500`. After headers commit,
  React and Web Streams own boundary recovery or stream termination.
- Expected request aborts do not log as render failures.
- Browser hydration uses one framework error boundary so an unexpected render failure does not crash
  outside React. A later navigation or HMR publication can recover it without remounting healthy
  trees. Caught render failures reach development diagnostics; only a successful recovery commit
  clears them. Application error boundaries retain their own recovery policy.

## HTTP policy

Server Function POST and QUERY requests require an Origin whose host matches request `Host`;
forwarded hosts are not trusted. Bun rejects bodies over 10 MiB before routing or React decoding.
Dynamic framework responses default to `Cache-Control: private, no-store`; Page negotiation adds
`Vary: Accept`. Application middleware may override caching.

Public assets use Effect `HttpStaticServer`. Application HTTP, APIs, RPC, and global middleware
share the same router and Layer. The [build contract](build.md) owns asset cache policy.

`serverLayer` configures Bun independently of `NODE_ENV`: contextual error pages are disabled to
avoid leaking failure messages/stacks, and the idle timeout is disabled to retain stalled Suspense
connections. Connection deadlines belong to the deployment in front of the application.

## Middleware reach

| Request                          | Scoped route middleware              | Scoped Server Function middleware | Native global middleware |
| -------------------------------- | ------------------------------------ | --------------------------------- | ------------------------ |
| Page GET/HEAD                    | Matched route scope                  | No                                | Yes                      |
| Hydrated Server Function POST    | Remaining route scope around refresh | Server Function scope             | Yes                      |
| Progressive Server Function POST | Remaining route scope around refresh | Server Function scope             | Yes                      |
| Server Function QUERY            | No                                   | Server Function scope             | Yes                      |
| Userland HTTP, assets, unmatched | No                                   | No                                | Yes                      |

Within one Server Function request, middleware already active in the Server Function scope is not
executed again for the route refresh, even if it appears at a different position in the route chain.

## Owners

- [`server/application.ts`](../../packages/effective-rsc/src/server/application.ts)
- [`server/html-renderer.tsx`](../../packages/effective-rsc/src/server/html-renderer.tsx)
- [`server/flight-renderer.tsx`](../../packages/effective-rsc/src/server/flight-renderer.tsx)
- [`server/server-fn/response.ts`](../../packages/effective-rsc/src/server/server-fn/response.ts)
- [`client/server-fn/protocol.ts`](../../packages/effective-rsc/src/client/server-fn/protocol.ts)
- [`client/route-loader.ts`](../../packages/effective-rsc/src/client/route-loader.ts)
