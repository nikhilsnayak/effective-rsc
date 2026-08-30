## Userland HTTP

Register native Effect `HttpRouter`, `HttpApi`, or RPC layers in the Layer passed to
`ERSC.make({ layer })`. They share the framework's HTTP server and Layer scope.

Register routes that use application services with `HttpRouter.use`, then provide and retain those
services with `Layer.provideMerge`. The same service instances remain available to ERSC concerns.

Native global middleware belongs in the same application Layer. It observes Page requests, Server
Function requests, raw HTTP, assets, and unmatched requests.
