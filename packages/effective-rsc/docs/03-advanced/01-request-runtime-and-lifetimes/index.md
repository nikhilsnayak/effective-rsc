## Request runtime and lifetimes

The server builds the Layer passed to `ERSC.make` once and releases it at shutdown. Its services have
application lifetime.

Each HTTP request has an independent Effect scope. Pages, Layouts, Components, and Server Functions
run their Effects within that scope.

The Flight stream owns the request scope. Closing that stream interrupts its request Effects and
runs their finalizers. Acquire request-local resources inside the request Effect so their lifetime
follows the request automatically.

Give work that must outlive a request an explicit application-owned scope.
