## Server Function execution and refresh

Hydrated invocations and progressively enhanced forms execute the same request-scoped Effect
handler. A hydrated response contains the imperative result and a refreshed route tree; a
progressively enhanced response contains a complete document with the refreshed tree and form state.

For hydrated calls, the result Promise settles independently from the route refresh. ERSC commits
the refreshed tree in a React transition and keeps its work active through React commit and Flight
EOF. Canceling that work interrupts the handler Effect and response stream.

After a successful mutation, ERSC clears the Back/Forward traversal cache because any route may have
changed.
