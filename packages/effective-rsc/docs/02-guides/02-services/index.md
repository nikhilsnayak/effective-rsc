## Services

ERSC does not prescribe how to define Effect services. Its convention is:

1. Declare the complete service union with `Application.ersc<Services>()`.
2. Let Pages, Layouts, Components, and Server Functions require members of that union.
3. Provide the complete Layer once with `ERSC.make({ layer })`.

This keeps implementations at the application composition boundary and preserves requirements after
React turns renderers into JSX values.

The server builds `layer` once and shares its services across requests until shutdown. Layer
finalizers run when the server closes. Keep shared mutable state concurrency-safe; in-memory state is
process-local and is lost on restart. Acquire request-local resources inside the request Effect so
interruption releases them with that request.
