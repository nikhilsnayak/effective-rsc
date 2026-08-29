## Server Functions

`ERSC.ServerFn.make` adds Schema input decoding, an Effect handler, request cancellation, application
services, and a whole-tree refresh to React's Server Function protocol. The refresh runs in a React
transition, retaining the revealed route while refreshed content suspends.

- Export it by name from a `'use server'` module.
- Invoke it only through its client reference; direct server invocation throws.
- Bind serializable input in a Server Component, then pass the action to a Client Component.
- Let `input` infer the handler parameter; do not annotate it.
- The returned client reference resolves `Promise<Output>`.
- Browser requests require an `Origin` matching the application host and may contain at most 10 MiB.
- Encode expected mutation failures in a discriminated `Output` union. The Effect error channel is
  not exposed by the client reference yet.
