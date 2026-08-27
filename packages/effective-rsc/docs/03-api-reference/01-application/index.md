## Application

`Application.ersc<Services>()` creates one application-scoped authoring module. `Services` is the
complete server-service union; omit it for a service-free application.

`ERSC.make({ routes, servicesLayer })` closes the route graph and service universe. Export its result
from `src/application.tsx`. `servicesLayer` is required unless `Services` is `never`.
