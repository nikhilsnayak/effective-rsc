## Routing, parameters, and loading

- Routes are immutable and belong to one ERSC instance.
- `page(path, page)` attaches a Page; `mount(prefix, routes)` nests a route scope.
- Mounted scopes retain their Layout, Loading, and middleware ancestry.
- A scope's ordered `middleware` list applies to Page GET and native HEAD fallback for every
  descendant. Ancestors run before descendants; responses unwind in reverse order.
- Routes middleware does not apply to Server Function POST, userland HTTP, assets, or unmatched
  paths. Use native Effect HTTP global middleware for server-wide policy.
