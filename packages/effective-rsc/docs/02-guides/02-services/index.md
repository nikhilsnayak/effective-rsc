## Services

1. Declare application services with `Application.ersc<Catalog | Mailer>()`.
2. Use those services in Page, Layout, Component, and Server Function Effects.
3. Provide their Layer once with `ERSC.make({ routes, layer })`.

The Layer is built at startup and released at shutdown. Use middleware to provide request-local
services such as the current user.

<!-- source-navigation -->

### Examples

- [Define a service](./10_catalog.ts)
- [Provide services](./20_application.tsx)
