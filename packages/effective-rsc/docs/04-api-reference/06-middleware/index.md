## Middleware

`ERSC.Middleware.make(handler)` adapts an Effect HTTP middleware to the current ERSC identity.
`ERSC.withMiddleware(middleware)` returns a derived authoring view of that same identity.

Use `ERSC.Middleware.make<{ provides: CurrentUser }>(handler)` when the handler provides a service to
the downstream Effect. Multiple services use a union. The derived view adds those services to the
requirements available to Page, Layout, Component, ServerFn, Routes, Middleware, and further derived
views.

Routes and ServerFn activate retained middleware. Page, Layout, and Component consume its services
only while React renders them inside an active scope. Rendering one outside its required scope is a
programmer error and throws `TypeError`.

Chain `withMiddleware` in request order. Ancestors run before descendants; response transformations
unwind in reverse. A middleware repeated in one resolved mounted route chain is rejected. Shared
middleware across mounted scopes runs once.

## Reach

| Request                          | Route scope                          | Server Function scope | Native global middleware |
| -------------------------------- | ------------------------------------ | --------------------- | ------------------------ |
| Page GET/HEAD                    | Matched chain                        | No                    | Yes                      |
| Hydrated Server Function POST    | Remaining route chain around refresh | Server Function chain | Yes                      |
| Progressive Server Function POST | No route refresh in the POST         | Server Function chain | Yes                      |
| Userland HTTP, assets, unmatched | No                                   | No                    | Yes                      |

During a hydrated Server Function request, middleware already active for the Server Function is not
executed again for the refreshed route, even if it appears at another position in that route chain.
Remaining route middleware wraps refreshed rendering.

Native global Effect HTTP middleware is separate. Register it through the application Layer for
server-wide policy.
