## Request runtime and lifetimes

The server builds the Layer passed to `ERSC.make` once and releases it at shutdown. Its services have
application lifetime.

Each HTTP request has an independent Effect scope. Server Function handlers run in the HTTP request
fiber. Page, Layout, and Component render Effects run in a request-owned render scope.

Closing the response interrupts unfinished request work and runs its finalizers. Acquire
request-local resources inside the request Effect so their lifetime follows the request
automatically.

Give work that must outlive a request an explicit application-owned scope.
