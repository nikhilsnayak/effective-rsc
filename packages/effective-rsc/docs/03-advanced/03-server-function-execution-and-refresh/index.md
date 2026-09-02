## Server Function execution and refresh

Hydrated invocations and progressively enhanced forms execute the same request-scoped Effect
handler. A hydrated response contains the Server Function result and a refreshed route tree; a
progressively enhanced response contains a complete document with the refreshed tree and form state.

For hydrated calls, the result Promise settles independently from the route refresh. ERSC commits
the refreshed tree in a React transition and keeps the request active through React commit and
Flight EOF. Disconnecting interrupts unfinished request work and the response stream.

Hydrated invocations may execute concurrently. Only the latest invocation may apply its response's
route tree while its original history entry remains current and no navigation is active. Other
responses trigger a fresh current-route refresh. A response tree interrupts any older current-route
refresh before rendering.

After a successful mutation, ERSC clears the Back/Forward traversal cache because any route may have
changed.
