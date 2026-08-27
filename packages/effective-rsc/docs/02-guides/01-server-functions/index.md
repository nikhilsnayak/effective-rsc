## Server Functions

`ERSC.ServerFn.make` adds Schema input decoding, an Effect handler, request cancellation, application
services, and a whole-tree refresh to React's Server Function protocol.

- Export it by name from a `'use server'` module.
- Invoke it only through its client reference; direct server invocation throws.
- Bind serializable input before passing it to a form action.
- Let `input` infer the handler parameter; do not annotate it.
- The returned client reference resolves `Promise<Output>`.
- Encode expected mutation failures in a discriminated `Output` union. The Effect error channel is
  not exposed by the client reference yet.
