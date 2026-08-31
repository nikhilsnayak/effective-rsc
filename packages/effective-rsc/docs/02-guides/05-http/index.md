## Userland HTTP

Register native Effect `HttpRouter`, `HttpApi`, or RPC layers in the Layer passed to
`ERSC.make({ layer })`. They share the framework's HTTP server, application services, and shutdown
scope.

Register routes that require application services with `HttpRouter.use`, then retain those services
with `Layer.provideMerge`.

Native global middleware belongs in the same application Layer. It observes Page requests, Server
Function requests, userland HTTP, assets, and unmatched requests. ERSC-scoped middleware has narrower
reach.

<!-- source-navigation -->

### Examples

- [Compose ERSC and userland HTTP](./10_application-layer.tsx)

### Related

- [Services](../02-services/index.md)
- [Middleware](../04-middleware/index.md)
