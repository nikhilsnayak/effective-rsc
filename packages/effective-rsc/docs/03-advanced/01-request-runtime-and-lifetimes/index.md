## Resources and cancellation

The Layer passed to `ERSC.make` is built once at startup and released at shutdown. Use it for
application services; use middleware and scoped Effects for request-local resources.

Page, Layout, Component, and Server Function Effects run with their request. Response completion,
disconnection, or interruption closes the request and finalizes its resources. Give background work
that must outlive the response an explicit application owner.

Interrupting a `ServerFn.query` Effect cancels its pending invocation. A `ServerFn.stream` consumer
owns the browser request until it completes or is interrupted. Atom helpers cancel an earlier run
when invoked again.

Returned Effect Streams also belong to the request. Cancellation waits for their asynchronous
finalizers before releasing request resources, including when the client stops consuming a stream.

In development, a successful rebuild interrupts the old application's requests before replacing its
services. An interrupted Server Function is not automatically retried.

<!-- source-navigation -->

- [Client query and stream helpers](../../04-api-reference/09-client-queries-and-streams/index.md)
