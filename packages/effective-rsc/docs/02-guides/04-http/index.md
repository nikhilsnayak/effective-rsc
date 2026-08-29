## Userland HTTP

Register native Effect `HttpRouter`, `HttpApi`, or RPC layers in the Layer passed to
`ERSC.make({ layer })`. They share the framework's HTTP server and Layer scope.

Wire a raw handler's service requirements with native Effect HTTP composition. Use
`HttpRouter.provideRequest(ServiceLayer)` for route handlers, then merge the resulting HTTP Layer and
the Service Layer into the application Layer.

Native global middleware belongs in the same application Layer. It observes Page requests, Server
Function requests, raw HTTP, assets, and unmatched requests.
