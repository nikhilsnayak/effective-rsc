## Application

`Application.ersc<Services>()` creates one application-scoped authoring module. `Services` is the
complete server-service union; omit it for a service-free application.

`ERSC.make({ routes, layer })` closes the route graph and application runtime. Export its result from
`src/application.tsx`. `layer` is required unless `Services` is `never`; it may provide the declared
services and register native Effect HTTP on the framework router.
