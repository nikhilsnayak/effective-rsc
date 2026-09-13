## API reference

| Import                 | Use                                                      |
| ---------------------- | -------------------------------------------------------- |
| `effective-rsc`        | `Application` and server authoring factories             |
| `effective-rsc/client` | `ServerFn` query/stream helpers and error types          |
| `effective-rsc/server` | Custom Bun startup with `start`                          |
| `effective-rsc/build`  | Deployment adapter types                                 |
| `effective-rsc/types`  | TypeScript declarations for stylesheet and asset imports |

`Application.ersc<Services>()` returns `Page`, `Layout`, `Loading`, `Component`, `Middleware`,
`Routes`, `ServerFn`, `withMiddleware`, and `make`. Create values from one instance and its derived
views. The package root is server-only; importing it from a Client Component throws.

<!-- source-navigation -->

- [Application](./01-application/index.md)
- [Page](./02-page/index.md)
- [Layout](./03-layout/index.md)
- [Loading](./04-loading/index.md)
- [Component](./05-component/index.md)
- [Middleware](./06-middleware/index.md)
- [Routes](./07-routes/index.md)
- [ServerFn](./08-server-fn/index.md)
- [Client queries and streams](./09-client-queries-and-streams/index.md)
- [Production startup](../03-advanced/04-production-startup/index.md)
