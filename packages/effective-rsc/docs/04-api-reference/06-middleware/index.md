## Middleware

`ERSC.Middleware.make(handler)` accepts an Effect HTTP middleware.
`ERSC.withMiddleware(middleware)` returns a view of the same application with that middleware attached.

Use `ERSC.Middleware.make<{ provides: CurrentUser }>(handler)` to declare a service provided to the
downstream Effect; use a union for multiple services. All factories on the derived view can use those
services. Routes and ServerFn activate middleware; Page, Layout, and Component consume it while
rendered in that scope. Rendering outside a required scope throws `TypeError`.

Chain middleware in request order. Ancestors run first; response transformations unwind in reverse.
Repeating a middleware in one resolved route chain is rejected. Shared middleware across mounted
scopes runs once.

### Reach

| Request                             | Route middleware               | Server Function middleware | Global middleware |
| ----------------------------------- | ------------------------------ | -------------------------- | ----------------- |
| Page load or navigation             | Matched route chain            | No                         | Yes               |
| Hydrated or progressive mutation    | Remaining chain around refresh | Function chain             | Yes               |
| Query or stream helper              | No                             | Function chain             | Yes               |
| User HTTP, assets, unmatched routes | No                             | No                         | Yes               |

A mutation refresh skips middleware already active for its Server Function. Register native global
Effect HTTP middleware through the application Layer for server-wide policy.
