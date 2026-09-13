## Application

`Application.ersc<Services>()` creates the application's authoring API. Declare the application
service union in `Services`, or omit it when no services are needed. Create all application values
from this instance or its `withMiddleware` views.

`ERSC.make({ routes, layer })` returns the application definition to export from
`src/application.tsx`. `layer` must provide the declared services and may register native Effect
HTTP routes. It is optional when `Services` is `never` and is built once at startup.
