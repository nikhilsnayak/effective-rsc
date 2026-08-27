## Routing, parameters, and loading

- Routes are immutable and belong to one ERSC instance.
- `page(path, page)` attaches a Page to an Effect HTTP path.
- `mount(prefix, routes)` mounts a non-empty graph below a parameter-free prefix.
- A Page parameter Schema must exactly match its path parameters.
- Nested scopes may own a Layout, Loading fallback, both, or neither.
- Loading is synchronous and service-free.
- Root Routes require a Layout and at least one Page.

An unmatched path receives Effect HTTP's native `404`. A matched Page cannot currently set an HTTP
status or redirect. Render entity absence as Page output only when a `200` response is acceptable;
matched-route `404` and redirect outcomes remain open framework contracts.
