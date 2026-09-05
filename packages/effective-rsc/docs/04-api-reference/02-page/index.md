## Page

- `ERSC.Page.make({ render })` creates a static route leaf.
- `ERSC.Page.make({ params, render })` creates a parameterized route leaf.

`render` returns an Effect whose requirements fit the ERSC service union. For parameterized Pages,
the Schema's encoded keys must exactly match the path parameters and accept strings. Compose the
Page with `Routes.page`.

Pages produce React output. On GET/HEAD, the request handler decodes parameters once before
rendering, with services from existing route middleware available. Rejected parameters receive
an empty `404`, including navigation Flight requests; unmatched routes also receive native `404`
responses. Other failures keep their existing
error behavior.

Server Function POST refreshes decode parameters inside Page rendering. A rejection follows React's
render-error path without replacing the completed Server Function result with a `404`.
