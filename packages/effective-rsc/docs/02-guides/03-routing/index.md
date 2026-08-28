## Routing, parameters, and loading

- Routes are immutable and belong to one ERSC instance.
- `page(path, page)` attaches a Page to an Effect HTTP path.
- `mount(prefix, routes)` mounts a non-empty graph below a parameter-free prefix.
- A Page parameter Schema must exactly match its path parameters.
- Nested scopes may own a Layout, Loading fallback, both, or neither.
- A scope's ordered `middleware` list applies to Page GET and native HEAD fallback for every
  descendant. Ancestors run before descendants; responses unwind in reverse order.
- ERSC resolves scope inheritance and delegates composition to native Effect
  `HttpRouter.Middleware`.
- Routes middleware does not apply to Server Function POST, userland HTTP, assets, or unmatched
  paths. Use native Effect HTTP global middleware for server-wide policy.
- Loading is synchronous and service-free.
- Root Routes require a Layout and at least one Page.

An unmatched path receives Effect HTTP's native `404`. A matched Page cannot currently set an HTTP
status or redirect. Render entity absence as Page output only when a `200` response is acceptable;
matched-route `404` and redirect outcomes remain open framework contracts.
